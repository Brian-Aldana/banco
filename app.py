# app.py
import datetime
import random 
from flask import Flask, request, jsonify, session, render_template, redirect, url_for
from flask_migrate import Migrate
from collections import deque
from werkzeug.security import generate_password_hash, check_password_hash
import click 

# Importar modelos, db, y utils
from models import (
    db, Cliente, CuentaAhorros, Credito, CDT, Transaccion, TarjetaCredito,
    TipoTransaccion, TipoCliente, TipoCredito, Cajero
)
from utils import (
    calcular_tabla_amortizacion, 
    login_required,
    cajero_login_required,
    log_action_lifo, pop_action_lifo
)

# --- Configuración de la App ---
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///banco_ucundinamarca.db'
app.config['SECRET_KEY'] = 'mi_llave_secreta_combinada_para_cajeros_y_clientes'
db.init_app(app)
migrate = Migrate(app, db)


# === ESTADO GLOBAL (FIFO) ===
class Turno:
    def __init__(self, nombre, tipo, numero_turno, id_cliente=None):
        self.nombre, self.tipo, self.numero_turno, self.id_cliente = nombre, tipo, numero_turno, id_cliente
    def to_dict(self):
        return {"nombre": self.nombre, "tipo": self.tipo, "numero_turno": self.numero_turno, "id_cliente": self.id_cliente}
filas = {"preferencial": deque(), "afiliado": deque(), "no_afiliado": deque()}
contadores_turnos = {"preferencial": 0, "afiliado": 0, "no_afiliado": 0}
turno_actual_en_caja = None
# ============================================


# === RUTAS DE PÁGINAS (HTML) ===
@app.route('/')
def index_page():
    return render_template('index.html')
@app.route('/login')
def login_page():
    return render_template('login.html')
@app.route('/register')
def register_page():
    return render_template('register.html')
@app.route('/filas')
def filas_page():
    return render_template('filas.html')
@app.route('/cajero/login', methods=['GET'])
def cajero_login_page():
    return render_template('cajero_login.html')
@app.route('/cajero')
@cajero_login_required
def cajero_page():
    return render_template('cajero.html')
@app.route('/dashboard_cliente')
@login_required 
def dashboard_cliente_page():
    return render_template('dashboard_cliente.html')

# === RUTAS DE API (JSON) ===

# --- API de Filas (FIFO) ---
@app.route('/filas/tomar_turno', methods=['POST'])
def tomar_turno():
    data = request.json
    nombre = data.get('nombre'); es_afiliado = data.get('es_afiliado', False)
    es_preferencial = data.get('es_preferencial', False); id_cliente = data.get('id_cliente')
    tipo_fila = "no_afiliado"; prefijo = "N"
    if es_preferencial:
        tipo_fila = "preferencial"; prefijo = "P"
    elif es_afiliado:
        tipo_fila = "afiliado"; prefijo = "A"
    contadores_turnos[tipo_fila] += 1
    numero = contadores_turnos[tipo_fila]
    nuevo_turno = Turno(nombre=nombre, tipo=tipo_fila, numero_turno=f"{prefijo}-{numero:02d}", id_cliente=id_cliente)
    filas[tipo_fila].append(nuevo_turno)
    return jsonify({"turno": nuevo_turno.to_dict()}), 201

@app.route('/filas/validar_afiliado', methods=['POST'])
def validar_afiliado():
    data = request.json
    email = data.get('email'); password = data.get('password')
    cliente = db.session.scalar(db.select(Cliente).where(Cliente.email == email))
    if cliente and check_password_hash(cliente.password_hash, password):
        if cliente.tipo_cliente == TipoCliente.AFILIADO:
            return jsonify({"validado": True, "id_cliente": cliente.id, "nombre": cliente.nombre_completo})
        else:
            return jsonify({"validado": False, "error": "Tus credenciales son correctas, pero aún no eres un cliente afiliado."}), 403
    return jsonify({"validado": False, "error": "Email o contraseña incorrectos."}), 401

@app.route('/filas/llamar_siguiente', methods=['GET'])
@cajero_login_required 
def llamar_siguiente_turno():
    global turno_actual_en_caja
    colas_disponibles = []; pesos = []
    if len(filas["preferencial"]) > 0:
        colas_disponibles.append("preferencial"); pesos.append(0.25)
    if len(filas["afiliado"]) > 0:
        colas_disponibles.append("afiliado"); pesos.append(0.6)
    if len(filas["no_afiliado"]) > 0:
        colas_disponibles.append("no_afiliado"); pesos.append(0.15)
    if not colas_disponibles:
        turno_actual_en_caja = None
        return jsonify({"mensaje": "No hay clientes en espera"}), 404
    cola_elegida = random.choices(colas_disponibles, weights=pesos, k=1)[0]
    turno_actual_en_caja = filas[cola_elegida].popleft()
    log_action_lifo(f"Llamó turno {turno_actual_en_caja.numero_turno} (Cliente: {turno_actual_en_caja.nombre})")
    return jsonify({"turno_llamado": turno_actual_en_caja.to_dict()})

@app.route('/filas/estado_actual', methods=['GET'])
def estado_filas():
    return jsonify({
        "turno_en_caja": turno_actual_en_caja.to_dict() if turno_actual_en_caja else None,
        "fila_preferencial": [t.numero_turno for t in filas['preferencial']],
        "fila_afiliado": [t.numero_turno for t in filas['afiliado']],
        "fila_no_afiliado": [t.numero_turno for t in filas['no_afiliado']],
    })

# --- API de Cliente (Registro/Login) ---
@app.route('/cliente/registrar', methods=['POST'])
def registrar_cliente():
    data = request.json
    try:
        hashed_password = generate_password_hash(data['password'])
        nuevo_cliente = Cliente(
            nombre_completo=data['nombre_completo'], email=data['email'],
            password_hash=hashed_password,
            fecha_nacimiento=datetime.date.fromisoformat(data['fecha_nacimiento']),
            tiene_discapacidad=data.get('tiene_discapacidad', False),
            tipo_cliente=TipoCliente.NO_AFILIADO 
        )
        db.session.add(nuevo_cliente); db.session.commit(); db.session.refresh(nuevo_cliente) 
        session['cliente_id'] = nuevo_cliente.id
        session['cliente_nombre'] = nuevo_cliente.nombre_completo
        session['historial_acciones'] = [] 
        log_action_lifo("Cliente recién registrado inició sesión")
        return jsonify({"mensaje": "Cliente registrado con éxito", "id": nuevo_cliente.id}), 201
    except Exception as e:
        db.session.rollback(); return jsonify({"error": f"Error al registrar: {str(e)}"}), 400

@app.route('/cliente/login', methods=['POST'])
def login():
    data = request.json
    cliente = db.session.scalar(db.select(Cliente).where(Cliente.email == data['email']))
    if cliente and check_password_hash(cliente.password_hash, data['password']):
        session['cliente_id'] = cliente.id
        session['cliente_nombre'] = cliente.nombre_completo
        session['historial_acciones'] = [] 
        log_action_lifo("Inicio de sesión de cliente")
        return jsonify({"mensaje": f"Bienvenido {cliente.nombre_completo}"})
    return jsonify({"error": "Credenciales inválidas"}), 401

@app.route('/cliente/logout', methods=['POST'])
def logout():
    session.pop('cliente_id', None); session.pop('cliente_nombre', None); session.pop('historial_acciones', None)
    return jsonify({"mensaje": "Sesión cerrada con éxito"})

@app.route('/cliente/perfil', methods=['GET'])
@login_required 
def get_perfil():
    cliente_id = session['cliente_id']
    cliente = db.session.get(Cliente, cliente_id)
    if not cliente: return jsonify({"error": "Cliente no encontrado"}), 404
    log_action_lifo("Cliente vio su perfil/dashboard")
    cuentas = [{"id": c.id, "numero_cuenta": c.numero_cuenta, "saldo": c.saldo, "exenta_4x1000": c.exenta_4x1000} for c in cliente.cuentas_ahorros]
    creditos = [{"id": c.id, "tipo_credito": c.tipo_credito.value, "monto_aprobado": c.monto_aprobado, "saldo_pendiente": c.saldo_pendiente} for c in cliente.creditos]
    tarjetas = [{"id": t.id, "numero_tarjeta": "XXXX ... " + t.numero_tarjeta[-4:], "cupo_total": t.cupo_total, "cupo_usado": t.cupo_usado, "tasa_interes_mensual": t.tasa_interes_mensual} for t in cliente.tarjetas_credito]
    cdts = [{"id": c.id, "monto_inversion": c.monto_inversion, "plazo_dias": c.plazo_dias, "tasa_interes_anual": c.tasa_interes_anual} for c in cliente.cdts]
    return jsonify({"id": cliente.id, "nombre": cliente.nombre_completo, "email": cliente.email, "tipo_cliente": cliente.tipo_cliente.value, "cuentas_ahorros": cuentas, "creditos": creditos, "tarjetas_credito": tarjetas, "cdts": cdts})

@app.route('/cliente/afiliarme', methods=['POST'])
@login_required 
def afiliarme():
    cliente_id = session['cliente_id']
    cliente = db.session.get(Cliente, cliente_id)
    if not cliente: return jsonify({"success": False, "error": "Cliente no encontrado"}), 404
    if cliente.tipo_cliente == TipoCliente.AFILIADO: return jsonify({"success": False, "error": "Ya eras un cliente afiliado"}), 400
    cliente.tipo_cliente = TipoCliente.AFILIADO
    db.session.add(cliente); db.session.commit()
    log_action_lifo("Cliente se auto-afilió")
    return jsonify({"success": True, "mensaje": "¡Felicidades, ahora eres afiliado!"})

@app.route('/cliente/credito/<int:id_credito>/amortizacion', methods=['GET'])
@login_required
def get_cliente_tabla_amortizacion(id_credito):
    cliente_id = session['cliente_id']
    credito = db.session.get(Credito, id_credito)
    if not credito or credito.cliente_id != cliente_id:
        return jsonify({"error": "Crédito no encontrado o no pertenece al usuario"}), 403
    cuota, tabla = calcular_tabla_amortizacion(monto_prestamo=credito.monto_aprobado, tasa_interes_anual=credito.tasa_interes_anual, plazo_meses=credito.plazo_meses)
    log_action_lifo(f"Cliente vio amortización del crédito {credito.id}")
    return jsonify({"credito_id": credito.id, "cuota_fija_mensual": round(cuota, 2), "tabla_amortizacion": tabla})

@app.route('/cliente/crear_cuenta_ahorros', methods=['POST'])
@login_required
def crear_cuenta_ahorros():
    cliente = db.session.get(Cliente, session['cliente_id'])
    if not cliente or cliente.tipo_cliente != TipoCliente.AFILIADO:
        return jsonify({"success": False, "error": "Debes ser un cliente afiliado para crear productos."}), 403
    nuevo_numero_cuenta = f"410-{random.randint(100000, 999999)}-{cliente.id}"
    nueva_cuenta = CuentaAhorros(numero_cuenta=nuevo_numero_cuenta, saldo=0.0, cliente_id=cliente.id)
    db.session.add(nueva_cuenta); db.session.commit()
    log_action_lifo(f"Cliente creó nueva cuenta de ahorros {nuevo_numero_cuenta}")
    return jsonify({"success": True, "mensaje": f"Nueva cuenta {nuevo_numero_cuenta} creada con éxito."})

@app.route('/cliente/solicitar_credito', methods=['POST'])
@login_required
def solicitar_credito():
    cliente = db.session.get(Cliente, session['cliente_id'])
    if not cliente or cliente.tipo_cliente != TipoCliente.AFILIADO:
        return jsonify({"success": False, "error": "Debes ser un cliente afiliado para crear productos."}), 403
    data = request.json
    monto = data.get('monto'); plazo = data.get('plazo'); tipo_str = data.get('tipo')
    tipo = TipoCredito[tipo_str]
    tasa_interes = 0.25
    if tipo == TipoCredito.CARTERA: tasa_interes = 0.18
    nuevo_credito = Credito(tipo_credito=tipo, monto_aprobado=monto, saldo_pendiente=monto, tasa_interes_anual=tasa_interes, plazo_meses=plazo, cliente_id=cliente.id)
    db.session.add(nuevo_credito); db.session.commit()
    log_action_lifo(f"Cliente solicitó crédito de {monto}")
    return jsonify({"success": True, "mensaje": "¡Crédito aprobado y desembolsado!"})

@app.route('/cliente/solicitar_tarjeta', methods=['POST'])
@login_required
def solicitar_tarjeta():
    cliente = db.session.get(Cliente, session['cliente_id'])
    if not cliente or cliente.tipo_cliente != TipoCliente.AFILIADO:
        return jsonify({"success": False, "error": "Debes ser un cliente afiliado para crear productos."}), 403
    data = request.json; cupo = data.get('cupo_solicitado')
    nuevo_numero_tarjeta = f"4500{random.randint(1000, 9999)}{random.randint(1000, 9999)}{random.randint(1000, 9999)}"
    tasa_mensual = 0.029
    nueva_tarjeta = TarjetaCredito(numero_tarjeta=nuevo_numero_tarjeta, cupo_total=cupo, cupo_usado=0.0, tasa_interes_mensual=tasa_mensual, cliente_id=cliente.id)
    db.session.add(nueva_tarjeta); db.session.commit()
    log_action_lifo(f"Cliente solicitó tarjeta con cupo de {cupo}")
    return jsonify({"success": True, "mensaje": "¡Tarjeta de crédito aprobada!"})

@app.route('/cliente/abrir_cdt', methods=['POST'])
@login_required
def abrir_cdt():
    cliente = db.session.get(Cliente, session['cliente_id'])
    if not cliente or cliente.tipo_cliente != TipoCliente.AFILIADO:
        return jsonify({"success": False, "error": "Debes ser un cliente afiliado para crear productos."}), 403
    
    data = request.json
    monto = data.get('monto')
    plazo_dias = data.get('plazo_dias')
    id_cuenta_origen = data.get('id_cuenta_origen') # <-- Recibimos el ID

    cuenta_origen = db.session.get(CuentaAhorros, id_cuenta_origen)
    
    # Doble chequeo: que la cuenta exista y que pertenezca al cliente
    if not cuenta_origen or cuenta_origen.cliente_id != cliente.id:
        return jsonify({"success": False, "error": "La cuenta de origen seleccionada no es válida."}), 403
    
    if cuenta_origen.saldo < monto:
        return jsonify({"success": False, "error": f"Fondos insuficientes en tu cuenta {cuenta_origen.numero_cuenta}."}), 400
    
    # APLICAR 4x1000 si la cuenta de origen no es exenta
    impuesto = 0
    if not cuenta_origen.exenta_4x1000:
        impuesto = monto * 0.004 # 0.4%
        if cuenta_origen.saldo < (monto + impuesto):
            return jsonify({"success": False, "error": f"Fondos insuficientes (se requiere ${impuesto} extra para el 4x1000)."}), 400
    
    cuenta_origen.saldo -= (monto + impuesto)
    
    tasa_anual = 0.12
    fecha_creacion = datetime.date.today()
    fecha_vencimiento = fecha_creacion + datetime.timedelta(days=plazo_dias)
    nuevo_cdt = CDT(monto_inversion=monto, plazo_dias=plazo_dias, tasa_interes_anual=tasa_anual, fecha_creacion=fecha_creacion, fecha_vencimiento=fecha_vencimiento, cliente_id=cliente.id)
    
    db.session.add(cuenta_origen); db.session.add(nuevo_cdt)
    # Registrar la transacción del impuesto si aplicó
    if impuesto > 0:
        trans_impuesto = Transaccion(tipo=TipoTransaccion.PAGO, monto=impuesto, cuenta_id=cuenta_origen.id)
        db.session.add(trans_impuesto)

    db.session.commit()
    log_action_lifo(f"Cliente abrió CDT por {monto}")
    return jsonify({"success": True, "mensaje": f"¡CDT abierto! Se descontaron ${monto} (y ${impuesto} de 4x1000) de tu cuenta {cuenta_origen.numero_cuenta}."})


# --- APIS DE CLIENTE: CONSIGNAR, RETIRAR, ELIMINAR, PAGAR! ---

@app.route('/cliente/consignar', methods=['POST'])
@login_required
def cliente_consignar():
    cliente_id = session['cliente_id']
    data = request.json
    id_cuenta = data.get('id_cuenta'); monto = data.get('monto')
    cuenta = db.session.get(CuentaAhorros, id_cuenta)
    
    if not cuenta or cuenta.cliente_id != cliente_id:
        return jsonify({"success": False, "error": "Cuenta no encontrada o no te pertenece."}), 403
    if monto <= 0:
        return jsonify({"success": False, "error": "El monto debe ser positivo."}), 400
        
    cuenta.saldo += monto
    trans = Transaccion(tipo=TipoTransaccion.CONSIGNACION, monto=monto, cuenta_id=cuenta.id)
    
    db.session.add(cuenta); db.session.add(trans); db.session.commit()
    log_action_lifo(f"Cliente consignó ${monto} en cuenta {cuenta.numero_cuenta}")
    return jsonify({"success": True, "mensaje": "Consignación exitosa", "nuevo_saldo": cuenta.saldo})

@app.route('/cliente/retirar', methods=['POST'])
@login_required
def cliente_retirar():
    cliente_id = session['cliente_id']
    data = request.json
    id_cuenta = data.get('id_cuenta'); monto = data.get('monto')
    cuenta = db.session.get(CuentaAhorros, id_cuenta)
    
    if not cuenta or cuenta.cliente_id != cliente_id:
        return jsonify({"success": False, "error": "Cuenta no encontrada o no te pertenece."}), 403
    if monto <= 0:
        return jsonify({"success": False, "error": "El monto debe ser positivo."}), 400

    # Lógica 4x1000
    impuesto = 0
    if not cuenta.exenta_4x1000:
        impuesto = monto * 0.004 # 0.4%
    
    costo_total = monto + impuesto
    
    if cuenta.saldo < costo_total:
        return jsonify({"success": False, "error": f"Fondos insuficientes. (Necesitas ${costo_total} incl. 4x1000)"}), 400
        
    cuenta.saldo -= costo_total
    
    trans_retiro = Transaccion(tipo=TipoTransaccion.RETIRO, monto=monto, cuenta_id=cuenta.id)
    db.session.add(trans_retiro)
    
    if impuesto > 0:
        trans_impuesto = Transaccion(tipo=TipoTransaccion.PAGO, monto=impuesto, cuenta_id=cuenta.id)
        db.session.add(trans_impuesto)
        log_action_lifo(f"Cliente pagó 4x1000 de ${impuesto}")
    
    db.session.add(cuenta); db.session.commit()
    log_action_lifo(f"Cliente retiró ${monto} de cuenta {cuenta.numero_cuenta}")
    return jsonify({"success": True, "mensaje": f"Retiro exitoso de ${monto} (Costo 4x1000: ${impuesto})", "nuevo_saldo": cuenta.saldo})

@app.route('/cliente/eliminar_cuenta', methods=['POST'])
@login_required
def eliminar_cuenta():
    cliente_id = session['cliente_id']
    data = request.json; id_cuenta = data.get('id_cuenta')
    cuenta = db.session.get(CuentaAhorros, id_cuenta)
    cliente = db.session.get(Cliente, cliente_id)

    if not cuenta or cuenta.cliente_id != cliente_id:
        return jsonify({"success": False, "error": "Cuenta no encontrada o no te pertenece."}), 403
    if cuenta.saldo > 0:
        return jsonify({"success": False, "error": "La cuenta debe tener saldo $0 para ser eliminada."}), 400
    if len(cliente.cuentas_ahorros) <= 1:
        return jsonify({"success": False, "error": "No puedes eliminar tu única cuenta de ahorros."}), 400
    if cuenta.exenta_4x1000:
        return jsonify({"success": False, "error": "No puedes eliminar tu cuenta exenta. Marca otra como exenta primero."}), 400

    db.session.query(Transaccion).filter(Transaccion.cuenta_id == cuenta.id).delete()
    db.session.delete(cuenta)
    db.session.commit()
    
    log_action_lifo(f"Cliente eliminó cuenta {cuenta.numero_cuenta}")
    return jsonify({"success": True, "mensaje": "Cuenta eliminada exitosamente."})

@app.route('/cliente/pagar_con_tarjeta', methods=['POST'])
@login_required
def pagar_con_tarjeta():
    cliente_id = session['cliente_id']
    data = request.json
    id_tarjeta = data.get('id_tarjeta'); monto = data.get('monto')
    tarjeta = db.session.get(TarjetaCredito, id_tarjeta)
    
    if not tarjeta or tarjeta.cliente_id != cliente_id:
        return jsonify({"success": False, "error": "Tarjeta no encontrada."}), 403

    cupo_disponible = tarjeta.cupo_total - tarjeta.cupo_usado
    if monto > cupo_disponible:
        return jsonify({"success": False, "error": f"Cupo insuficiente. Disponible: ${cupo_disponible}"}), 400
        
    tarjeta.cupo_usado += monto
    db.session.add(tarjeta); db.session.commit()
    log_action_lifo(f"Cliente pagó ${monto} con tarjeta {tarjeta.numero_tarjeta[-4:]}")
    return jsonify({"success": True, "mensaje": "Pago con tarjeta exitoso."})

@app.route('/cliente/pagar_credito', methods=['POST'])
@login_required
def pagar_credito():
    cliente = db.session.get(Cliente, session['cliente_id'])
    data = request.json
    id_credito = data.get('id_credito'); monto = data.get('monto')
    credito = db.session.get(Credito, id_credito)
    
    if not credito or credito.cliente_id != cliente.id:
        return jsonify({"success": False, "error": "Crédito no encontrado."}), 403
    if not cliente.cuentas_ahorros:
        return jsonify({"success": False, "error": "Necesitas una cuenta de ahorros para pagar el crédito."}), 400
    
    cuenta_origen = cliente.cuentas_ahorros[0] # Pagar desde la primera cuenta
    
    # 4x1000 Lógica
    impuesto = 0
    if not cuenta_origen.exenta_4x1000:
        impuesto = monto * 0.004
    
    costo_total = monto + impuesto
    
    if cuenta_origen.saldo < costo_total:
        return jsonify({"success": False, "error": f"Fondos insuficientes (se requiere ${costo_total} incl. 4x1000)."}), 400
    if monto > credito.saldo_pendiente:
        monto = credito.saldo_pendiente # Ajustar para pagar solo lo que se debe
        
    cuenta_origen.saldo -= costo_total
    credito.saldo_pendiente -= monto
    
    if impuesto > 0:
        trans_impuesto = Transaccion(tipo=TipoTransaccion.PAGO, monto=impuesto, cuenta_id=cuenta_origen.id)
        db.session.add(trans_impuesto)
    
    db.session.add(cuenta_origen); db.session.add(credito); db.session.commit()
    log_action_lifo(f"Cliente abonó ${monto} al crédito {credito.id}")
    return jsonify({"success": True, "mensaje": f"Abono de ${monto} realizado (Costo 4x1000: ${impuesto}). Nuevo saldo: ${credito.saldo_pendiente}"})

# --- ¡APIS DE CLIENTE! ---
@app.route('/cliente/marcar_exenta', methods=['POST'])
@login_required
def marcar_exenta():
    cliente_id = session['cliente_id']
    data = request.json
    id_cuenta_exenta = data.get('id_cuenta')
    
    cliente = db.session.get(Cliente, cliente_id)

    # 1. Poner todas las cuentas de este cliente en Falso
    for cuenta in cliente.cuentas_ahorros:
        cuenta.exenta_4x1000 = False
        db.session.add(cuenta)
        
    # 2. Poner la cuenta seleccionada en Verdadero
    cuenta_a_marcar = db.session.get(CuentaAhorros, id_cuenta_exenta)
    if not cuenta_a_marcar or cuenta_a_marcar.cliente_id != cliente_id:
        return jsonify({"success": False, "error": "Cuenta no válida."}), 403
    
    cuenta_a_marcar.exenta_4x1000 = True
    db.session.add(cuenta_a_marcar)
    db.session.commit()
    
    log_action_lifo(f"Cliente marcó cuenta {cuenta_a_marcar.numero_cuenta} como exenta 4x1000")
    return jsonify({"success": True, "mensaje": "Cuenta actualizada a exenta 4x1000."})

@app.route('/cliente/transferir', methods=['POST'])
@login_required
def transferir_entre_cuentas():
    cliente_id = session['cliente_id']
    data = request.json
    id_origen = data.get('id_cuenta_origen')
    id_destino = data.get('id_cuenta_destino')
    monto = data.get('monto')

    if id_origen == id_destino:
        return jsonify({"success": False, "error": "No puedes transferir a la misma cuenta."}), 400

    cuenta_origen = db.session.get(CuentaAhorros, id_origen)
    cuenta_destino = db.session.get(CuentaAhorros, id_destino)

    if not cuenta_origen or cuenta_origen.cliente_id != cliente_id:
        return jsonify({"success": False, "error": "Cuenta de origen no válida."}), 403
    if not cuenta_destino or cuenta_destino.cliente_id != cliente_id:
        return jsonify({"success": False, "error": "Cuenta de destino no válida."}), 403
        
    # Lógica 4x1000
    impuesto = 0
    if not cuenta_origen.exenta_4x1000:
        impuesto = monto * 0.004
    
    costo_total = monto + impuesto
    if cuenta_origen.saldo < costo_total:
        return jsonify({"success": False, "error": f"Fondos insuficientes (se requiere ${costo_total} incl. 4x1000)."}), 400

    # Ejecutar la transacción
    cuenta_origen.saldo -= costo_total
    cuenta_destino.saldo += monto
    
    trans_retiro = Transaccion(tipo=TipoTransaccion.RETIRO, monto=monto, cuenta_id=cuenta_origen.id)
    trans_consigna = Transaccion(tipo=TipoTransaccion.CONSIGNACION, monto=monto, cuenta_id=cuenta_destino.id)
    db.session.add_all([cuenta_origen, cuenta_destino, trans_retiro, trans_consigna])

    if impuesto > 0:
        trans_impuesto = Transaccion(tipo=TipoTransaccion.PAGO, monto=impuesto, cuenta_id=cuenta_origen.id)
        db.session.add(trans_impuesto)
        log_action_lifo(f"Cliente pagó 4x1000 de ${impuesto}")

    db.session.commit()
    log_action_lifo(f"Cliente transfirió ${monto} de {cuenta_origen.numero_cuenta} a {cuenta_destino.numero_cuenta}")
    return jsonify({"success": True, "mensaje": f"Transferencia exitosa (Costo 4x1000: ${impuesto})"})

@app.route('/cliente/realizar_avance', methods=['POST'])
@login_required
def realizar_avance():
    cliente_id = session['cliente_id']
    data = request.json
    id_tarjeta = data.get('id_tarjeta')
    id_cuenta_destino = data.get('id_cuenta_destino')
    monto = data.get('monto')
    
    tarjeta = db.session.get(TarjetaCredito, id_tarjeta)
    cuenta_destino = db.session.get(CuentaAhorros, id_cuenta_destino)

    if not tarjeta or tarjeta.cliente_id != cliente_id:
        return jsonify({"success": False, "error": "Tarjeta no válida."}), 403
    if not cuenta_destino or cuenta_destino.cliente_id != cliente_id:
        return jsonify({"success": False, "error": "Cuenta de destino no válida."}), 403

    # (Simulación de comisión por avance)
    comision = monto * 0.05 # 5% de comisión
    costo_total_avance = monto + comision
    
    cupo_disponible = tarjeta.cupo_total - tarjeta.cupo_usado
    if costo_total_avance > cupo_disponible:
        return jsonify({"success": False, "error": f"Cupo insuficiente. (Necesitas ${costo_total_avance} incl. comisión)"}), 400
        
    # Aplicar transacción
    tarjeta.cupo_usado += costo_total_avance
    cuenta_destino.saldo += monto
    
    trans_avance = Transaccion(tipo=TipoTransaccion.CONSIGNACION, monto=monto, cuenta_id=cuenta_destino.id)
    
    db.session.add_all([tarjeta, cuenta_destino, trans_avance])
    db.session.commit()
    
    log_action_lifo(f"Cliente realizó avance de ${monto} con tarjeta {tarjeta.numero_tarjeta[-4:]}")
    return jsonify({"success": True, "mensaje": f"Avance de ${monto} realizado (Costo comisión: ${comision})."})

@app.route('/cliente/pagar_tarjeta', methods=['POST'])
@login_required
def pagar_tarjeta():
    cliente_id = session['cliente_id']
    data = request.json
    id_tarjeta = data.get('id_tarjeta')
    id_cuenta_origen = data.get('id_cuenta_origen')
    monto = data.get('monto')
    
    tarjeta = db.session.get(TarjetaCredito, id_tarjeta)
    cuenta_origen = db.session.get(CuentaAhorros, id_cuenta_origen)

    if not tarjeta or tarjeta.cliente_id != cliente_id:
        return jsonify({"success": False, "error": "Tarjeta no válida."}), 403
    if not cuenta_origen or cuenta_origen.cliente_id != cliente_id:
        return jsonify({"success": False, "error": "Cuenta de origen no válida."}), 403
    
    if monto > tarjeta.cupo_usado:
        # Pagar solo lo que se debe
        monto = tarjeta.cupo_usado
    
    # Lógica 4x1000 (el pago de tarjeta es un débito)
    impuesto = 0
    if not cuenta_origen.exenta_4x1000:
        impuesto = monto * 0.004
    
    costo_total = monto + impuesto
    if cuenta_origen.saldo < costo_total:
        return jsonify({"success": False, "error": f"Fondos insuficientes (se requiere ${costo_total} incl. 4x1000)."}), 400

    # Aplicar transacción
    cuenta_origen.saldo -= costo_total
    tarjeta.cupo_usado -= monto # Se libera el cupo
    
    trans_pago = Transaccion(tipo=TipoTransaccion.RETIRO, monto=monto, cuenta_id=cuenta_origen.id)
    db.session.add_all([tarjeta, cuenta_origen, trans_pago])
    
    if impuesto > 0:
        trans_impuesto = Transaccion(tipo=TipoTransaccion.PAGO, monto=impuesto, cuenta_id=cuenta_origen.id)
        db.session.add(trans_impuesto)

    db.session.commit()
    
    log_action_lifo(f"Cliente pagó ${monto} a tarjeta {tarjeta.numero_tarjeta[-4:]}")
    return jsonify({"success": True, "mensaje": f"Pago de ${monto} a tarjeta realizado (Costo 4x1000: ${impuesto})."})


@app.route('/cliente/cuenta/<int:id_cuenta>/transacciones', methods=['GET'])
@login_required
def get_transacciones(id_cuenta):
    cliente_id = session['cliente_id']
    cuenta = db.session.get(CuentaAhorros, id_cuenta)
    
    if not cuenta or cuenta.cliente_id != cliente_id:
        return jsonify({"error": "Cuenta no encontrada."}), 403
    
    # Lógica LIFO: Ordenar por fecha descendente (más reciente primero)
    transacciones = db.session.scalars(
        db.select(Transaccion)
        .where(Transaccion.cuenta_id == id_cuenta)
        .order_by(Transaccion.fecha.desc())
        .limit(20) # Limitar a las últimas 20
    ).all()
    
    # Serializar
    lista_transacciones = [
        {
            "id": t.id,
            "tipo": t.tipo.value,
            "monto": t.monto,
            "fecha": t.fecha.strftime("%Y-%m-%d %H:%M") # Formato de fecha
        } for t in transacciones
    ]
    
    log_action_lifo(f"Cliente vio movimientos de cuenta {cuenta.numero_cuenta}")
    return jsonify(lista_transacciones)


# --- API del CAJERO (Login y Operaciones) ---
@app.route('/cajero/login', methods=['POST'])
def cajero_login_api():
    data = request.json; email = data.get('email'); password = data.get('password')
    cajero = db.session.scalar(db.select(Cajero).where(Cajero.email == email))
    if cajero and check_password_hash(cajero.password_hash, password):
        session['cajero_id'] = cajero.id; session['cajero_nombre'] = cajero.nombre
        session['historial_acciones_cajero'] = []
        log_action_lifo(f"Cajero {cajero.nombre} inició sesión")
        return jsonify({"mensaje": f"Bienvenido {cajero.nombre}"})
    return jsonify({"error": "Credenciales de cajero inválidas"}), 401
@app.route('/cajero/logout', methods=['POST'])
def cajero_logout():
    session.pop('cajero_id', None); session.pop('cajero_nombre', None); session.pop('historial_acciones_cajero', None)
    return jsonify({"mensaje": "Sesión de cajero cerrada"})
@app.route('/cajero/buscar_cliente', methods=['POST'])
@cajero_login_required
def buscar_cliente():
    data = request.json; search_term = data.get('search_term')
    cliente = db.session.scalar(db.select(Cliente).where(Cliente.email == search_term))
    if not cliente:
        try: cliente = db.session.get(Cliente, int(search_term))
        except (ValueError, TypeError): pass
    if not cliente: return jsonify({"error": "Cliente no encontrado"}), 404
    cuentas = [{"id": c.id, "numero_cuenta": c.numero_cuenta, "saldo": c.saldo, "exenta_4x1000": c.exenta_4x1000} for c in cliente.cuentas_ahorros]
    creditos = [{"id": c.id, "tipo_credito": c.tipo_credito.value, "monto_aprobado": c.monto_aprobado, "saldo_pendiente": c.saldo_pendiente} for c in cliente.creditos]
    tarjetas = [{"id": t.id, "numero_tarjeta": t.numero_tarjeta, "cupo_total": t.cupo_total, "cupo_usado": t.cupo_usado} for t in cliente.tarjetas_credito]
    cdts = [{"id": c.id, "monto_inversion": c.monto_inversion, "plazo_dias": c.plazo_dias, "tasa_interes_anual": c.tasa_interes_anual} for c in cliente.cdts]
    log_action_lifo(f"Cajero buscó al cliente ID {cliente.id}")
    return jsonify({"id": cliente.id, "nombre_completo": cliente.nombre_completo, "email": cliente.email, "fecha_nacimiento": cliente.fecha_nacimiento.isoformat(), "tipo_cliente": cliente.tipo_cliente.value, "cuentas_ahorros": cuentas, "creditos": creditos, "tarjetas_credito": tarjetas, "cdts": cdts})
@app.route('/cajero/realizar_consignacion', methods=['POST'])
@cajero_login_required
def cajero_consignar():
    data = request.json; cuenta = db.session.get(CuentaAhorros, data['id_cuenta'])
    if not cuenta: return jsonify({"error": "Cuenta no encontrada"}), 404
    if data['monto'] <= 0: return jsonify({"error": "Monto debe ser positivo"}), 400
    cuenta.saldo += data['monto']
    trans = Transaccion(tipo=TipoTransaccion.CONSIGNACION, monto=data['monto'], cuenta_id=cuenta.id)
    db.session.add(cuenta); db.session.add(trans); db.session.commit()
    log_action_lifo(f"Cajero consignó ${data['monto']} a cuenta {cuenta.id}")
    return jsonify({"mensaje": "Consignación exitosa", "nuevo_saldo": cuenta.saldo, "cliente_id": cuenta.cliente_id})
@app.route('/cajero/realizar_retiro', methods=['POST'])
@cajero_login_required
def cajero_retirar():
    data = request.json; cuenta = db.session.get(CuentaAhorros, data['id_cuenta'])
    if not cuenta: return jsonify({"error": "Cuenta no encontrada"}), 404
    if data['monto'] <= 0: return jsonify({"error": "Monto debe ser positivo"}), 400
    # Cajero no paga 4x1000 (asumimos que es retiro en ventanilla)
    if cuenta.saldo < data['monto']: return jsonify({"error": "Fondos insuficientes"}), 400
    cuenta.saldo -= data['monto']
    trans = Transaccion(tipo=TipoTransaccion.RETIRO, monto=data['monto'], cuenta_id=cuenta.id)
    db.session.add(cuenta); db.session.add(trans); db.session.commit()
    log_action_lifo(f"Cajero retiró ${data['monto']} de cuenta {cuenta.id}")
    return jsonify({"mensaje": "Retiro exitoso", "nuevo_saldo": cuenta.saldo, "cliente_id": cuenta.cliente_id})
@app.route('/cajero/afiliar_cliente', methods=['POST'])
@cajero_login_required
def afiliar_cliente():
    data = request.json
    try:
        nuevo_cliente = Cliente(
            nombre_completo=data['nombre_completo'], email=data['email'],
            fecha_nacimiento=datetime.date.fromisoformat(data['fecha_nacimiento']),
            tiene_discapacidad=data.get('tiene_discapacidad', False),
            tipo_cliente=TipoCliente.AFILIADO, password_hash=""
        )
        db.session.add(nuevo_cliente); db.session.commit()
        log_action_lifo(f"Cajero afilió nuevo cliente: {nuevo_cliente.nombre_completo}")
        return jsonify({"mensaje": "Cliente afiliado con éxito", "id_cliente": nuevo_cliente.id}), 201
    except Exception as e:
        db.session.rollback(); return jsonify({"error": f"Error al afiliar: {str(e)}"}), 400
@app.route('/cajero/cancelar_cuenta', methods=['POST'])
@cajero_login_required
def cancelar_cuenta():
    data = request.json; cuenta = db.session.get(CuentaAhorros, data['id_cuenta'])
    if not cuenta: return jsonify({"error": "Cuenta no encontrada"}), 404
    if cuenta.saldo > 0: return jsonify({"error": f"La cuenta aún tiene saldo (${cuenta.saldo}). Debe estar en 0 para cancelar."}), 400
    db.session.query(Transaccion).filter(Transaccion.cuenta_id == cuenta.id).delete()
    db.session.delete(cuenta); db.session.commit()
    log_action_lifo(f"Cajero canceló cuenta {cuenta.id}")
    return jsonify({"mensaje": "Cuenta cancelada exitosamente", "cliente_id": cuenta.cliente_id})
@app.route('/credito/<int:id_credito>/amortizacion', methods=['GET'])
@cajero_login_required
def get_tabla_amortizacion(id_credito):
    credito = db.session.get(Credito, id_credito)
    if not credito: return jsonify({"error": "Crédito no encontrado"}), 404
    cuota, tabla = calcular_tabla_amortizacion(monto_prestamo=credito.monto_aprobado, tasa_interes_anual=credito.tasa_interes_anual, plazo_meses=credito.plazo_meses)
    log_action_lifo(f"Cajero vio amortización del crédito {credito.id}")
    return jsonify({"credito_id": credito.id, "cuota_fija_mensual": round(cuota, 2), "tabla_amortizacion": tabla})
@app.route('/cajero/historial/ver', methods=['GET'])
@cajero_login_required
def ver_historial_lifo_cajero():
    historial = session.get('historial_acciones_cajero', [])
    return jsonify({"historial": list(reversed(historial))})


# --- Comandos para inicializar la DB ---
@app.cli.command("seed-db")
def seed_db_command():
    cajero = db.session.scalar(db.select(Cajero).where(Cajero.email == 'cajero@banco.com'))
    if not cajero:
        cajero_pass_hash = generate_password_hash('cajero123')
        cajero_test = Cajero(email='cajero@banco.com', nombre='Cajero de Prueba', password_hash=cajero_pass_hash)
        db.session.add(cajero_test)
        print("Cajero de prueba (cajero@banco.com) creado.")
    
    cliente_afiliado = db.session.scalar(db.select(Cliente).where(Cliente.email == 'cliente@test.com'))
    if not cliente_afiliado:
        cliente_pass_hash = generate_password_hash('cliente123')
        cliente_afiliado = Cliente(
            nombre_completo='Cliente Afiliado (Prueba)', email='cliente@test.com',
            password_hash=cliente_pass_hash, fecha_nacimiento=datetime.date(1990, 1, 1),
            tipo_cliente=TipoCliente.AFILIADO
        )
        db.session.add(cliente_afiliado); db.session.commit(); db.session.refresh(cliente_afiliado)
        cuenta_ahorros = CuentaAhorros(numero_cuenta="001-A", saldo=1500000, cliente_id=cliente_afiliado.id, exenta_4x1000=True) # Marcamos la primera como exenta
        credito_libre = Credito(tipo_credito=TipoCredito.LIBRE_INVERSION, monto_aprobado=5000000, saldo_pendiente=4500000, tasa_interes_anual=0.22, plazo_meses=24, cliente_id=cliente_afiliado.id)
        tarjeta_cred = TarjetaCredito(numero_tarjeta="4500123456780001", cupo_total=2000000, cupo_usado=500000, tasa_interes_mensual=0.028, cliente_id=cliente_afiliado.id)
        cdt_test = CDT(monto_inversion=1000000, plazo_dias=180, tasa_interes_anual=0.11, fecha_creacion=datetime.date.today(), fecha_vencimiento=datetime.date.today() + datetime.timedelta(days=180), cliente_id=cliente_afiliado.id)
        db.session.add_all([cuenta_ahorros, credito_libre, tarjeta_cred, cdt_test])
        print("Cliente Afiliado de prueba (cliente@test.com) y sus productos han sido creados.")

    cliente_no = db.session.scalar(db.select(Cliente).where(Cliente.email == 'cliente_no@test.com'))
    if not cliente_no:
        cliente_no_pass_hash = generate_password_hash('cliente456')
        cliente_no_test = Cliente(
            nombre_completo='Cliente No Afiliado (Prueba)', email='cliente_no@test.com',
            password_hash=cliente_no_pass_hash, fecha_nacimiento=datetime.date(1995, 5, 5),
            tipo_cliente=TipoCliente.NO_AFILIADO
        )
        db.session.add(cliente_no_test)
        print("Cliente No Afiliado de prueba (cliente_no@test.com) creado.")
    
    db.session.commit()
    print("\n¡Usuarios de prueba listos!")

if __name__ == '__main__':
    app.run(debug=True)