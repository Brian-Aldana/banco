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
    db, Cliente, CuentaAhorros, Credito, CDT, Transaccion, 
    TipoTransaccion, TipoCliente, Cajero
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

# --- RUTA DE DASHBOARD DE CLIENTE ---
@app.route('/dashboard_cliente')
@login_required # Protegida por el login de CLIENTE
def dashboard_cliente_page():
    """Sirve el nuevo dashboard para clientes."""
    return render_template('dashboard_cliente.html')


# === RUTAS DE API (JSON) ===

# --- API de Filas (FIFO) ---

@app.route('/filas/tomar_turno', methods=['POST'])
def tomar_turno():
    data = request.json
    nombre = data.get('nombre')
    es_afiliado = data.get('es_afiliado', False)
    es_preferencial = data.get('es_preferencial', False)
    id_cliente = data.get('id_cliente')

    tipo_fila = "no_afiliado"
    prefijo = "N"
    if es_preferencial:
        tipo_fila = "preferencial"
        prefijo = "P"
    elif es_afiliado:
        tipo_fila = "afiliado"
        prefijo = "A"

    contadores_turnos[tipo_fila] += 1
    numero = contadores_turnos[tipo_fila]
    nuevo_turno = Turno(nombre=nombre, tipo=tipo_fila, numero_turno=f"{prefijo}-{numero:02d}", id_cliente=id_cliente)
    filas[tipo_fila].append(nuevo_turno)
    return jsonify({"turno": nuevo_turno.to_dict()}), 201

# --- RUTA DE VALIDACIÓN DE AFILIADO ---
@app.route('/filas/validar_afiliado', methods=['POST'])
def validar_afiliado():
    """
    Comprueba las credenciales y el estado de afiliado SIN crear una sesión.
    Usado por el kiosko de turnos.
    """
    data = request.json
    email = data.get('email')
    password = data.get('password')

    cliente = db.session.scalar(
        db.select(Cliente).where(Cliente.email == email)
    )
    
    # Comprobar si el cliente existe y la contraseña es correcta
    if cliente and check_password_hash(cliente.password_hash, password):
        # Comprobar si es AFILIADO
        if cliente.tipo_cliente == TipoCliente.AFILIADO:
            return jsonify({
                "validado": True,
                "id_cliente": cliente.id,
                "nombre": cliente.nombre_completo
            })
        else:
            return jsonify({"validado": False, "error": "Tus credenciales son correctas, pero aún no eres un cliente afiliado."}), 403
    
    return jsonify({"validado": False, "error": "Email o contraseña incorrectos."}), 401


@app.route('/filas/llamar_siguiente', methods=['GET'])
@cajero_login_required 
def llamar_siguiente_turno():
    global turno_actual_en_caja
    colas_disponibles = []
    pesos = []
    # --- Lógica de selección ponderada ---
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
    """
    Registra un cliente, lo setea como NO_AFILIADO por defecto,
    E INICIA SESIÓN automáticamente.
    """
    data = request.json
    try:
        hashed_password = generate_password_hash(data['password'])
        nuevo_cliente = Cliente(
            nombre_completo=data['nombre_completo'],
            email=data['email'],
            password_hash=hashed_password,
            fecha_nacimiento=datetime.date.fromisoformat(data['fecha_nacimiento']),
            tiene_discapacidad=data.get('tiene_discapacidad', False),
            tipo_cliente=TipoCliente.NO_AFILIADO
        )
        db.session.add(nuevo_cliente)
        db.session.commit()
        db.session.refresh(nuevo_cliente) # Para obtener el ID

        # --- Iniciar sesión automáticamente ---
        session['cliente_id'] = nuevo_cliente.id
        session['cliente_nombre'] = nuevo_cliente.nombre_completo
        session['historial_acciones'] = [] 
        log_action_lifo("Cliente recién registrado inició sesión")
        # --- Fin Iniciar sesión ---

        return jsonify({"mensaje": "Cliente registrado con éxito", "id": nuevo_cliente.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Error al registrar: {str(e)}"}), 400

@app.route('/cliente/login', methods=['POST'])
def login():
    # (Sin cambios, pero ahora JS redirige a /dashboard_cliente)
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
    session.pop('cliente_id', None)
    session.pop('cliente_nombre', None)
    session.pop('historial_acciones', None)
    return jsonify({"mensaje": "Sesión cerrada con éxito"})

@app.route('/cliente/perfil', methods=['GET'])
@login_required # <-- Decorador de CLIENTE
def get_perfil():
    """Devuelve el perfil del cliente logueado (para el dashboard_cliente)."""
    cliente_id = session['cliente_id']
    cliente = db.session.get(Cliente, cliente_id)
    if not cliente:
        return jsonify({"error": "Cliente no encontrado"}), 404
    
    log_action_lifo("Vio perfil de cliente")
    
    return jsonify({
        "id": cliente.id,
        "nombre": cliente.nombre_completo,
        "email": cliente.email,
        "tipo_cliente": cliente.tipo_cliente.value, # "AFILIADO" o "NO AFILIADO"
    })

# --- ¡NUEVA RUTA DE AFILIACIÓN! ---
@app.route('/cliente/afiliarme', methods=['POST'])
@login_required # <-- Decorador de CLIENTE
def afiliarme():
    """Permite a un cliente NO_AFILIADO convertirse en AFILIADO."""
    cliente_id = session['cliente_id']
    cliente = db.session.get(Cliente, cliente_id)
    
    if not cliente:
        return jsonify({"success": False, "error": "Cliente no encontrado"}), 404
        
    if cliente.tipo_cliente == TipoCliente.AFILIADO:
        return jsonify({"success": False, "error": "Ya eras un cliente afiliado"}), 400

    # ¡El cambio!
    cliente.tipo_cliente = TipoCliente.AFILIADO
    db.session.add(cliente)
    db.session.commit()
    
    log_action_lifo("Cliente se auto-afilió")
    return jsonify({"success": True, "mensaje": "¡Felicidades, ahora eres afiliado!"})


# --- API del CAJERO (Login y Operaciones) ---

@app.route('/cajero/login', methods=['POST'])
def cajero_login_api():
    # (API de login del cajero, sin cambios)
    data = request.json
    email = data.get('email')
    password = data.get('password')
    cajero = db.session.scalar(db.select(Cajero).where(Cajero.email == email))
    if cajero and check_password_hash(cajero.password_hash, password):
        session['cajero_id'] = cajero.id
        session['cajero_nombre'] = cajero.nombre
        session['historial_acciones_cajero'] = []
        log_action_lifo(f"Cajero {cajero.nombre} inició sesión")
        return jsonify({"mensaje": f"Bienvenido {cajero.nombre}"})
    return jsonify({"error": "Credenciales de cajero inválidas"}), 401

# --- Resto de APIs del Cajero (Sin cambios) ---

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
    cdts = [{"id": c.id, "monto_inversion": c.monto_inversion, "plazo_dias": c.plazo_dias, "tasa_interes_anual": c.tasa_interes_anual} for c in cliente.cdts]
    log_action_lifo(f"Cajero buscó al cliente ID {cliente.id}")
    return jsonify({"id": cliente.id, "nombre_completo": cliente.nombre_completo, "email": cliente.email, "fecha_nacimiento": cliente.fecha_nacimiento.isoformat(), "tipo_cliente": cliente.tipo_cliente.value, "cuentas_ahorros": cuentas, "creditos": creditos, "cdts": cdts})

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
    cuota, tabla = calcular_tabla_amortizacion(
        monto_prestamo=credito.monto_aprobado,
        tasa_interes_anual=credito.tasa_interes_anual,
        plazo_meses=credito.plazo_meses
    )
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
    
    # --- Crear Cajero de Prueba ---
    cajero = db.session.scalar(db.select(Cajero).where(Cajero.email == 'cajero@banco.com'))
    if not cajero:
        cajero_pass_hash = generate_password_hash('cajero123')
        cajero_test = Cajero(email='cajero@banco.com', nombre='Cajero de Prueba', password_hash=cajero_pass_hash)
        db.session.add(cajero_test)
        print("Cajero de prueba (cajero@banco.com) creado.")
    else:
        print("El cajero de prueba ya existe.")

    # --- Crear Cliente de Prueba (AFILIADO) ---
    cliente = db.session.scalar(db.select(Cliente).where(Cliente.email == 'cliente@test.com'))
    if not cliente:
        cliente_pass_hash = generate_password_hash('cliente123')
        cliente_test = Cliente(
            nombre_completo='Cliente Afiliado (Prueba)',
            email='cliente@test.com',
            password_hash=cliente_pass_hash,
            fecha_nacimiento=datetime.date(1990, 1, 1),
            tipo_cliente=TipoCliente.AFILIADO # Lo creamos afiliado para pruebas
        )
        db.session.add(cliente_test)
        print("Cliente Afiliado de prueba (cliente@test.com) creado.")
    else:
        print("El cliente afiliado de prueba ya existe.")
        
    # --- Crear Cliente de Prueba (NO AFILIADO) ---
    cliente_no = db.session.scalar(db.select(Cliente).where(Cliente.email == 'cliente_no@test.com'))
    if not cliente_no:
        cliente_no_pass_hash = generate_password_hash('cliente456')
        cliente_no_test = Cliente(
            nombre_completo='Cliente No Afiliado (Prueba)',
            email='cliente_no@test.com',
            password_hash=cliente_no_pass_hash,
            fecha_nacimiento=datetime.date(1995, 5, 5),
            tipo_cliente=TipoCliente.NO_AFILIADO # Default, pero lo ponemos explícito
        )
        db.session.add(cliente_no_test)
        print("Cliente No Afiliado de prueba (cliente_no@test.com) creado.")
    else:
        print("El cliente no afiliado de prueba ya existe.")
    
    db.session.commit()
    print("\n¡Usuarios de prueba listos!")


if __name__ == '__main__':
    app.run(debug=True)