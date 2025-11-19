import datetime
import random 
from flask import Flask, request, jsonify, session, render_template, redirect, url_for
from flask_migrate import Migrate
from collections import deque
from werkzeug.security import generate_password_hash, check_password_hash
from models import db, Cliente, CuentaAhorros, Credito, CDT, Transaccion, TarjetaCredito, TipoTransaccion, TipoCliente, TipoCredito, Cajero
from utils import calcular_tabla_amortizacion, login_required, cajero_login_required, log_action_lifo

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///banco_ucundinamarca.db'
app.config['SECRET_KEY'] = 'secret_key_banco_ucundinamarca'
db.init_app(app)
migrate = Migrate(app, db)

class Turno:
    def __init__(self, nombre, tipo, numero_turno, id_cliente=None):
        self.nombre = nombre; self.tipo = tipo; self.numero_turno = numero_turno; self.id_cliente = id_cliente
    def to_dict(self): return {"nombre": self.nombre, "tipo": self.tipo, "numero_turno": self.numero_turno, "id_cliente": self.id_cliente}

filas = {"preferencial": deque(), "afiliado": deque(), "no_afiliado": deque()}
contadores_turnos = {"preferencial": 0, "afiliado": 0, "no_afiliado": 0}
turno_actual_en_caja = None

@app.route('/')
def index_page(): return render_template('index.html')
@app.route('/login')
def login_page(): return render_template('login.html')
@app.route('/register')
def register_page(): return render_template('register.html')
@app.route('/filas')
def filas_page(): return render_template('filas.html')
@app.route('/cajero/login', methods=['GET'])
def cajero_login_page(): return render_template('cajero_login.html')
@app.route('/cajero')
@cajero_login_required
def cajero_page(): return render_template('cajero.html')
@app.route('/dashboard_cliente')
@login_required 
def dashboard_cliente_page(): return render_template('dashboard_cliente.html')

@app.route('/cliente/registrar', methods=['POST'])
def registrar_cliente():
    data = request.json
    try:
        hashed = generate_password_hash(data['password'])
        fecha_nac = datetime.date.fromisoformat(data['fecha_nacimiento'])
        if fecha_nac > datetime.date.today(): return jsonify({"error": "Fecha futura no permitida"}), 400
        nuevo = Cliente(nombre_completo=data['nombre_completo'], email=data['email'], password_hash=hashed, fecha_nacimiento=fecha_nac, tiene_discapacidad=data.get('tiene_discapacidad', False), tipo_cliente=TipoCliente.NO_AFILIADO)
        db.session.add(nuevo); db.session.commit(); db.session.refresh(nuevo)
        session['cliente_id'] = nuevo.id; session['cliente_nombre'] = nuevo.nombre_completo
        return jsonify({"mensaje": "Registro exitoso", "id": nuevo.id}), 201
    except Exception as e: return jsonify({"error": str(e)}), 400

@app.route('/cliente/login', methods=['POST'])
def login():
    data = request.json
    c = db.session.scalar(db.select(Cliente).where(Cliente.email == data['email']))
    if c and check_password_hash(c.password_hash, data['password']):
        session['cliente_id'] = c.id; session['cliente_nombre'] = c.nombre_completo
        return jsonify({"mensaje": "Bienvenido"})
    return jsonify({"error": "Credenciales inválidas"}), 401

@app.route('/cliente/logout', methods=['POST'])
def logout(): session.clear(); return jsonify({"mensaje": "Sesión cerrada"})

@app.route('/cliente/perfil', methods=['GET'])
@login_required 
def get_perfil():
    c = db.session.get(Cliente, session['cliente_id'])
    cuentas = [{"id": x.id, "numero_cuenta": x.numero_cuenta, "saldo": x.saldo, "exenta_4x1000": x.exenta_4x1000} for x in c.cuentas_ahorros]
    creditos = [{"id": x.id, "tipo_credito": x.tipo_credito.value, "monto_aprobado": x.monto_aprobado, "saldo_pendiente": x.saldo_pendiente, "tasa_interes_anual": x.tasa_interes_anual, "plazo_meses": x.plazo_meses} for x in c.creditos if not x.pagado]
    tarjetas = [{"id": x.id, "numero_tarjeta": "XXXX " + x.numero_tarjeta[-4:], "cupo_total": x.cupo_total, "cupo_usado": x.cupo_usado, "tasa_interes_mensual": x.tasa_interes_mensual} for x in c.tarjetas_credito]
    cdts = [{"id": x.id, "monto_inversion": x.monto_inversion, "plazo_dias": x.plazo_dias, "tasa_interes_anual": x.tasa_interes_anual} for x in c.cdts]
    return jsonify({"id": c.id, "nombre": c.nombre_completo, "email": c.email, "tipo_cliente": c.tipo_cliente.value, "cuentas_ahorros": cuentas, "creditos": creditos, "tarjetas_credito": tarjetas, "cdts": cdts})

@app.route('/cliente/afiliarme', methods=['POST'])
@login_required 
def afiliarme():
    c = db.session.get(Cliente, session['cliente_id'])
    if c.tipo_cliente == TipoCliente.AFILIADO: return jsonify({"error": "Ya eres afiliado"}), 400
    c.tipo_cliente = TipoCliente.AFILIADO; db.session.commit()
    return jsonify({"success": True, "mensaje": "¡Ahora eres afiliado!"})

def ejecutar_retiro(cuenta, monto):
    impuesto = 0 if cuenta.exenta_4x1000 else monto * 0.004
    total = monto + impuesto
    if cuenta.saldo < total: return False, f"Fondos insuficientes (Req: ${total:,.0f})", 0
    cuenta.saldo -= total
    db.session.add(Transaccion(tipo=TipoTransaccion.RETIRO, monto=monto, cuenta_id=cuenta.id))
    if impuesto > 0: db.session.add(Transaccion(tipo=TipoTransaccion.PAGO, monto=impuesto, cuenta_id=cuenta.id))
    return True, "Retiro exitoso", impuesto

@app.route('/cliente/retirar', methods=['POST'])
@login_required
def cliente_retirar():
    d = request.json; c = db.session.get(CuentaAhorros, d.get('id_cuenta'))
    if not c or c.cliente_id != session['cliente_id']: return jsonify({"error": "Cuenta inválida"}), 403
    ok, msg, imp = ejecutar_retiro(c, float(d.get('monto')))
    if not ok: return jsonify({"error": msg}), 400
    db.session.commit(); log_action_lifo(f"Retiró ${d.get('monto')}")
    return jsonify({"success": True, "mensaje": msg})

@app.route('/cliente/consignar', methods=['POST'])
@login_required
def cliente_consignar():
    d = request.json; c = db.session.get(CuentaAhorros, d.get('id_cuenta'))
    if not c or c.cliente_id != session['cliente_id']: return jsonify({"error": "Cuenta inválida"}), 403
    m = float(d.get('monto'))
    c.saldo += m; db.session.add(Transaccion(tipo=TipoTransaccion.CONSIGNACION, monto=m, cuenta_id=c.id))
    db.session.commit(); log_action_lifo(f"Consignó ${m}")
    return jsonify({"success": True, "mensaje": "Consignación exitosa"})

@app.route('/cliente/transferir', methods=['POST'])
@login_required
def transferir():
    d = request.json; org = db.session.get(CuentaAhorros, d.get('id_cuenta_origen')); dest = db.session.get(CuentaAhorros, d.get('id_cuenta_destino'))
    if not org or not dest or org.cliente_id != session['cliente_id']: return jsonify({"error": "Datos inválidos"}), 403
    if org.id == dest.id: return jsonify({"error": "Misma cuenta"}), 400
    m = float(d.get('monto'))
    if org.saldo < m: return jsonify({"error": "Fondos insuficientes"}), 400
    org.saldo -= m; dest.saldo += m
    db.session.add(Transaccion(tipo=TipoTransaccion.RETIRO, monto=m, cuenta_id=org.id))
    db.session.add(Transaccion(tipo=TipoTransaccion.CONSIGNACION, monto=m, cuenta_id=dest.id))
    db.session.commit(); log_action_lifo(f"Transfirió ${m}")
    return jsonify({"success": True, "mensaje": "Transferencia exitosa"})

@app.route('/cliente/pagar_tarjeta', methods=['POST'])
@login_required
def pagar_tarjeta():
    d = request.json; t = db.session.get(TarjetaCredito, d.get('id_tarjeta')); c = db.session.get(CuentaAhorros, d.get('id_cuenta_origen'))
    if not t or not c or c.cliente_id != session['cliente_id']: return jsonify({"error": "Datos inválidos"}), 403
    m = float(d.get('monto'))
    if m > t.cupo_usado: m = t.cupo_usado
    if m <= 0: return jsonify({"error": "Monto inválido"}), 400
    if c.saldo < m: return jsonify({"error": "Fondos insuficientes"}), 400
    c.saldo -= m; t.cupo_usado -= m
    if t.cupo_usado < 0: t.cupo_usado = 0
    db.session.add(Transaccion(tipo=TipoTransaccion.RETIRO, monto=m, cuenta_id=c.id))
    db.session.commit(); log_action_lifo(f"Pagó tarjeta ${m}")
    return jsonify({"success": True, "mensaje": "Pago exitoso"})

@app.route('/cliente/pagar_credito', methods=['POST'])
@login_required
def pagar_credito():
    d = request.json; cr = db.session.get(Credito, d.get('id_credito')); c = db.session.get(CuentaAhorros, d.get('id_cuenta_origen'))
    if not cr or not c or c.cliente_id != session['cliente_id']: return jsonify({"error": "Datos inválidos"}), 403
    m = float(d.get('monto'))
    if m > cr.saldo_pendiente: m = cr.saldo_pendiente
    if c.saldo < m: return jsonify({"error": "Fondos insuficientes"}), 400
    c.saldo -= m; cr.saldo_pendiente -= m
    if cr.saldo_pendiente <= 0: cr.saldo_pendiente = 0; cr.pagado = True
    db.session.add(Transaccion(tipo=TipoTransaccion.PAGO, monto=m, cuenta_id=c.id))
    db.session.add(c); db.session.add(cr); db.session.commit()
    return jsonify({"success": True, "mensaje": "Abono exitoso"})

@app.route('/cliente/realizar_avance', methods=['POST'])
@login_required
def realizar_avance():
    d = request.json; t = db.session.get(TarjetaCredito, d.get('id_tarjeta')); c = db.session.get(CuentaAhorros, d.get('id_cuenta_destino'))
    if not t or not c or t.cliente_id != session['cliente_id']: return jsonify({"error": "Datos inválidos"}), 403
    m = float(d.get('monto'))
    if (t.cupo_total - t.cupo_usado) < m: return jsonify({"error": "Cupo insuficiente"}), 400
    t.cupo_usado += m; c.saldo += m
    db.session.add(Transaccion(tipo=TipoTransaccion.CONSIGNACION, monto=m, cuenta_id=c.id)); db.session.commit()
    return jsonify({"success": True, "mensaje": "Avance exitoso"})

@app.route('/cliente/crear_cuenta_ahorros', methods=['POST'])
@login_required
def crear_cuenta_ahorros():
    c = db.session.get(Cliente, session['cliente_id'])
    if c.tipo_cliente != TipoCliente.AFILIADO: return jsonify({"error": "Debes ser afiliado"}), 403
    num = f"410-{random.randint(100000, 999999)}-{c.id}"
    db.session.add(CuentaAhorros(numero_cuenta=num, saldo=0.0, cliente_id=c.id)); db.session.commit()
    return jsonify({"success": True, "mensaje": "Cuenta creada"})

@app.route('/cliente/solicitar_credito', methods=['POST'])
@login_required
def solicitar_credito():
    d = request.json; c = db.session.get(Cliente, session['cliente_id'])
    if c.tipo_cliente != TipoCliente.AFILIADO: return jsonify({"error": "Debes ser afiliado"}), 403
    cta = db.session.get(CuentaAhorros, d.get('id_cuenta_destino'))
    if not cta: return jsonify({"error": "Cuenta destino inválida"}), 400
    m = float(d.get('monto')); t = TipoCredito[d.get('tipo')]
    cred = Credito(tipo_credito=t, monto_aprobado=m, saldo_pendiente=m, tasa_interes_anual=0.25, plazo_meses=d.get('plazo'), cliente_id=c.id, pagado=False)
    cta.saldo += m; db.session.add(cred); db.session.add(Transaccion(tipo=TipoTransaccion.CONSIGNACION, monto=m, cuenta_id=cta.id))
    db.session.commit(); return jsonify({"success": True, "mensaje": "Crédito aprobado y desembolsado"})

@app.route('/cliente/solicitar_tarjeta', methods=['POST'])
@login_required
def solicitar_tarjeta():
    d = request.json; c = db.session.get(Cliente, session['cliente_id'])
    if c.tipo_cliente != TipoCliente.AFILIADO: return jsonify({"error": "Debes ser afiliado"}), 403
    num = f"4500{random.randint(1000,9999)}{random.randint(1000,9999)}{random.randint(1000,9999)}"
    db.session.add(TarjetaCredito(numero_tarjeta=num, cupo_total=d.get('cupo_solicitado'), tasa_interes_mensual=0.029, cliente_id=c.id))
    db.session.commit(); return jsonify({"success": True, "mensaje": "Tarjeta aprobada"})

@app.route('/cliente/abrir_cdt', methods=['POST'])
@login_required
def abrir_cdt():
    d = request.json; c = db.session.get(Cliente, session['cliente_id'])
    if c.tipo_cliente != TipoCliente.AFILIADO: return jsonify({"error": "Debes ser afiliado"}), 403
    cta = db.session.get(CuentaAhorros, d.get('id_cuenta_origen'))
    m = float(d.get('monto'))
    if not cta or cta.cliente_id != c.id: return jsonify({"error": "Cuenta inválida"}), 400
    if cta.saldo < m: return jsonify({"error": "Fondos insuficientes"}), 400
    cta.saldo -= m
    cdt = CDT(monto_inversion=m, plazo_dias=d.get('plazo_dias'), tasa_interes_anual=0.12, fecha_creacion=datetime.date.today(), fecha_vencimiento=datetime.date.today()+datetime.timedelta(days=int(d.get('plazo_dias'))), cliente_id=c.id)
    db.session.add(cta); db.session.add(cdt); db.session.commit()
    return jsonify({"success": True, "mensaje": "CDT Abierto"})

@app.route('/cliente/eliminar_cuenta', methods=['POST'])
@login_required
def eliminar_cuenta():
    c = db.session.get(CuentaAhorros, request.json.get('id_cuenta'))
    if not c or c.cliente_id != session['cliente_id']: return jsonify({"error": "Cuenta inválida"}), 403
    if c.saldo > 0 and c.saldo < 50: c.saldo = 0 
    if c.saldo > 0: return jsonify({"error": "La cuenta debe tener saldo 0"}), 400
    db.session.query(Transaccion).filter(Transaccion.cuenta_id == c.id).delete()
    db.session.delete(c); db.session.commit()
    return jsonify({"success": True, "mensaje": "Cuenta eliminada"})

@app.route('/cliente/eliminar_tarjeta', methods=['POST'])
@login_required
def eliminar_tarjeta():
    t = db.session.get(TarjetaCredito, request.json.get('id_tarjeta'))
    if not t or t.cliente_id != session['cliente_id']: return jsonify({"error": "Inválida"}), 403
    if t.cupo_usado > 100: return jsonify({"error": "Debes pagar la deuda"}), 400
    db.session.delete(t); db.session.commit()
    return jsonify({"success": True, "mensaje": "Tarjeta eliminada"})

@app.route('/cliente/marcar_exenta', methods=['POST'])
@login_required
def marcar_exenta():
    c = db.session.get(Cliente, session['cliente_id'])
    for cuenta in c.cuentas_ahorros: cuenta.exenta_4x1000 = False
    target = db.session.get(CuentaAhorros, request.json.get('id_cuenta'))
    if target and target.cliente_id == c.id: target.exenta_4x1000 = True; db.session.commit()
    return jsonify({"success": True, "mensaje": "Cuenta marcada como exenta"})

@app.route('/cliente/credito/<int:id_credito>/amortizacion', methods=['GET'])
@login_required
def get_amortizacion(id_credito):
    cred = db.session.get(Credito, id_credito)
    if not cred or cred.cliente_id != session['cliente_id']: return jsonify({"error": "No encontrado"}), 403
    cuota, tabla = calcular_tabla_amortizacion(cred.monto_aprobado, cred.tasa_interes_anual, cred.plazo_meses)
    return jsonify({"cuota_fija_mensual": round(cuota, 2), "tabla_amortizacion": tabla})

@app.route('/cliente/cuenta/<int:id_cuenta>/transacciones', methods=['GET'])
@login_required
def get_transacciones(id_cuenta):
    c = db.session.get(CuentaAhorros, id_cuenta)
    if not c or c.cliente_id != session['cliente_id']: return jsonify({"error": "No encontrado"}), 403
    trans = db.session.scalars(db.select(Transaccion).where(Transaccion.cuenta_id==id_cuenta).order_by(Transaccion.fecha.desc())).all()
    return jsonify([{"tipo": t.tipo.value, "monto": t.monto, "fecha": t.fecha.strftime("%Y-%m-%d %H:%M")} for t in trans])

# --- CAJERO API ---
@app.route('/cajero/login', methods=['POST'])
def cajero_login_api():
    data = request.json
    c = db.session.scalar(db.select(Cajero).where(Cajero.email == data['email']))
    if c and check_password_hash(c.password_hash, data['password']):
        session['cajero_id'] = c.id; session['cajero_nombre'] = c.nombre
        return jsonify({"mensaje": "Bienvenido"})
    return jsonify({"error": "Inválido"}), 401

@app.route('/cajero/logout', methods=['POST'])
def cajero_logout(): session.pop('cajero_id', None); return jsonify({"mensaje": "Cerrado"})

@app.route('/filas/tomar_turno', methods=['POST'])
def tomar_turno():
    data = request.json; tipo = "no_afiliado"
    if data.get('es_preferencial'): tipo = "preferencial"
    elif data.get('es_afiliado'): tipo = "afiliado"
    contadores_turnos[tipo] += 1
    turno = Turno(data['nombre'], tipo, f"{tipo[0].upper()}-{contadores_turnos[tipo]:02d}", data.get('id_cliente'))
    filas[tipo].append(turno)
    return jsonify({"turno": turno.to_dict()})

@app.route('/filas/validar_afiliado', methods=['POST'])
def validar_afiliado():
    data = request.json
    c = db.session.scalar(db.select(Cliente).where(Cliente.email == data.get('email')))
    if c and check_password_hash(c.password_hash, data.get('password')) and c.tipo_cliente == TipoCliente.AFILIADO:
        return jsonify({"validado": True, "id_cliente": c.id, "nombre": c.nombre_completo})
    return jsonify({"validado": False, "error": "Inválido"}), 403

@app.route('/filas/llamar_siguiente', methods=['GET'])
@cajero_login_required
def llamar_siguiente():
    global turno_actual_en_caja
    colas = []
    if filas["preferencial"]: colas.append(("preferencial", 0.25))
    if filas["afiliado"]: colas.append(("afiliado", 0.60))
    if filas["no_afiliado"]: colas.append(("no_afiliado", 0.15))
    if not colas: return jsonify({"mensaje": "Nadie en fila"}), 404
    eleccion = random.choices([x[0] for x in colas], weights=[x[1] for x in colas], k=1)[0]
    turno_actual_en_caja = filas[eleccion].popleft()
    return jsonify({"turno_llamado": turno_actual_en_caja.to_dict()})

@app.route('/filas/estado_actual', methods=['GET'])
def estado_filas():
    return jsonify({
        "turno_en_caja": turno_actual_en_caja.to_dict() if turno_actual_en_caja else None,
        "fila_preferencial": [t.numero_turno for t in filas['preferencial']],
        "fila_afiliado": [t.numero_turno for t in filas['afiliado']],
        "fila_no_afiliado": [t.numero_turno for t in filas['no_afiliado']]
    })

@app.route('/cajero/buscar_cliente', methods=['POST'])
@cajero_login_required
def cajero_buscar_cliente():
    term = request.json.get('search_term')
    term_str = str(term)
    c = db.session.scalar(db.select(Cliente).where(Cliente.email == term_str))
    if not c and term_str.isdigit(): c = db.session.get(Cliente, int(term_str))
    if not c: return jsonify({"error": "No encontrado"}), 404
    
    cuentas = [{"id": x.id, "numero_cuenta": x.numero_cuenta, "saldo": x.saldo, "exenta_4x1000": x.exenta_4x1000} for x in c.cuentas_ahorros]
    creditos = [{"id": x.id, "tipo_credito": x.tipo_credito.value, "monto_aprobado": x.monto_aprobado, "saldo_pendiente": x.saldo_pendiente, "tasa_interes_anual": x.tasa_interes_anual, "plazo_meses": x.plazo_meses} for x in c.creditos if not x.pagado]
    tarjetas = [{"id": x.id, "numero_tarjeta": "XXXX " + x.numero_tarjeta[-4:], "cupo_total": x.cupo_total, "cupo_usado": x.cupo_usado, "tasa_interes_mensual": x.tasa_interes_mensual} for x in c.tarjetas_credito]
    cdts = [{"id": x.id, "monto_inversion": x.monto_inversion, "tasa_interes_anual": x.tasa_interes_anual, "plazo_dias": x.plazo_dias} for x in c.cdts]
    
    return jsonify({"id": c.id, "nombre_completo": c.nombre_completo, "email": c.email, "tipo_cliente": c.tipo_cliente.value, "cuentas_ahorros": cuentas, "creditos": creditos, "tarjetas_credito": tarjetas, "cdts": cdts})

@app.route('/cajero/consignar_tercero', methods=['POST'])
@cajero_login_required
def cajero_consignar_tercero():
    d=request.json; c=db.session.scalar(db.select(CuentaAhorros).where(CuentaAhorros.numero_cuenta==d.get('numero_cuenta')))
    if not c: return jsonify({"error": "No existe cuenta"}), 404
    c.saldo += float(d.get('monto')); db.session.add(Transaccion(tipo=TipoTransaccion.CONSIGNACION, monto=float(d.get('monto')), cuenta_id=c.id))
    db.session.commit(); return jsonify({"mensaje": "Exito"})

@app.route('/cajero/crear_cuenta', methods=['POST'])
@cajero_login_required
def cajero_crear_cuenta():
    d=request.json; c=db.session.get(Cliente, d.get('cliente_id'))
    num = f"410-{random.randint(100000, 999999)}-{c.id}"
    db.session.add(CuentaAhorros(numero_cuenta=num, saldo=0.0, cliente_id=c.id)); db.session.commit()
    return jsonify({"success":True, "mensaje":"Creada"})

@app.route('/cajero/solicitar_credito', methods=['POST'])
@cajero_login_required
def cajero_crear_credito():
    d=request.json; c=db.session.get(Cliente, d.get('cliente_id')); t=TipoCredito[d.get('tipo')]
    cta = db.session.get(CuentaAhorros, d.get('id_cuenta_destino'))
    if not cta: return jsonify({"error": "Cuenta destino inválida"}), 400
    m = float(d.get('monto'))
    db.session.add(Credito(tipo_credito=t, monto_aprobado=m, saldo_pendiente=m, tasa_interes_anual=0.25, plazo_meses=d.get('plazo'), cliente_id=c.id))
    cta.saldo += m; db.session.add(Transaccion(tipo=TipoTransaccion.CONSIGNACION, monto=m, cuenta_id=cta.id))
    db.session.commit(); return jsonify({"success":True, "mensaje":"Creado"})

@app.route('/cajero/solicitar_tarjeta', methods=['POST'])
@cajero_login_required
def cajero_crear_tarjeta():
    d=request.json; c=db.session.get(Cliente, d.get('cliente_id'))
    num = f"4500{random.randint(1000,9999)}{random.randint(1000,9999)}{random.randint(1000,9999)}"
    db.session.add(TarjetaCredito(numero_tarjeta=num, cupo_total=d.get('cupo'), tasa_interes_mensual=0.029, cliente_id=c.id))
    db.session.commit(); return jsonify({"success":True, "mensaje":"Creada"})

@app.route('/cajero/abrir_cdt', methods=['POST'])
@cajero_login_required
def cajero_abrir_cdt():
    d=request.json; co=db.session.get(CuentaAhorros, d.get('id_cuenta_origen')); m=float(d.get('monto'))
    ok, msg, imp = ejecutar_retiro(co, m)
    if not ok: return jsonify({"error": msg}), 400
    cdt = CDT(monto_inversion=m, plazo_dias=d.get('plazo'), tasa_interes_anual=0.12, fecha_creacion=datetime.date.today(), fecha_vencimiento=datetime.date.today()+datetime.timedelta(days=int(d.get('plazo'))), cliente_id=d.get('cliente_id'))
    db.session.add(co); db.session.add(cdt); db.session.commit()
    return jsonify({"success":True, "mensaje":"CDT Abierto"})

@app.route('/cajero/realizar_consignacion', methods=['POST'])
@cajero_login_required
def cajero_consignar():
    d=request.json; c=db.session.get(CuentaAhorros, d.get('id_cuenta')); m=float(d.get('monto'))
    c.saldo += m; db.session.add(Transaccion(tipo=TipoTransaccion.CONSIGNACION, monto=m, cuenta_id=c.id))
    db.session.commit(); log_action_lifo(f"Cajero consignó ${m}"); return jsonify({"mensaje": "Exito"})

@app.route('/cajero/realizar_retiro', methods=['POST'])
@cajero_login_required
def cajero_retirar():
    d=request.json; c=db.session.get(CuentaAhorros, d.get('id_cuenta')); m=float(d.get('monto'))
    ok, msg, imp = ejecutar_retiro(c, m) 
    if not ok: return jsonify({"error": msg}), 400
    db.session.commit(); log_action_lifo(f"Cajero retiró ${m}"); return jsonify({"mensaje": "Exito"})

@app.route('/cajero/afiliar_cliente', methods=['POST'])
@cajero_login_required
def afiliar_cliente_cajero():
    d=request.json
    try:
        hashed = generate_password_hash(d.get('password') or "1234")
        fecha_nac = datetime.date.fromisoformat(d['fecha_nacimiento'])
        nuevo = Cliente(nombre_completo=d['nombre_completo'], email=d['email'], password_hash=hashed, fecha_nacimiento=fecha_nac, tiene_discapacidad=False, tipo_cliente=TipoCliente.AFILIADO)
        db.session.add(nuevo); db.session.commit()
        return jsonify({"mensaje": "Cliente afiliado", "id_cliente": nuevo.id})
    except Exception as e: return jsonify({"error": str(e)}), 400

@app.route('/cajero/cancelar_cuenta', methods=['POST'])
@cajero_login_required
def cancelar_cuenta_cajero():
    c = db.session.get(CuentaAhorros, request.json.get('id_cuenta'))
    if c.saldo > 0 and c.saldo < 50: c.saldo = 0
    if c.saldo > 0: return jsonify({"error": "Saldo debe ser 0"}), 400
    db.session.query(Transaccion).filter(Transaccion.cuenta_id == c.id).delete(); db.session.delete(c); db.session.commit()
    return jsonify({"mensaje": "Cancelada"})

@app.route('/cajero/eliminar_tarjeta', methods=['POST'])
@cajero_login_required
def cancelar_tarjeta_cajero():
    t = db.session.get(TarjetaCredito, request.json.get('id_tarjeta'))
    if t.cupo_usado > 100: return jsonify({"error": "Deuda pendiente"}), 400
    db.session.delete(t); db.session.commit()
    return jsonify({"mensaje": "Eliminada"})

@app.route('/cajero/transferir', methods=['POST'])
@cajero_login_required
def cajero_transferir():
    d = request.json; org = db.session.get(CuentaAhorros, d.get('id_cuenta_origen')); dest = db.session.get(CuentaAhorros, d.get('id_cuenta_destino'))
    if not org or not dest: return jsonify({"error": "Cuentas inválidas"}), 404
    m = float(d.get('monto'))
    if org.saldo < m: return jsonify({"error": "Fondos insuficientes"}), 400 
    org.saldo -= m; dest.saldo += m
    db.session.add(Transaccion(tipo=TipoTransaccion.RETIRO, monto=m, cuenta_id=org.id))
    db.session.add(Transaccion(tipo=TipoTransaccion.CONSIGNACION, monto=m, cuenta_id=dest.id))
    db.session.commit(); log_action_lifo(f"Cajero transfirió ${m}"); return jsonify({"success": True, "mensaje": "Transferencia exitosa"})

@app.route('/cajero/pagar_credito', methods=['POST'])
@cajero_login_required
def cajero_pagar_credito():
    d = request.json; cr = db.session.get(Credito, d.get('id_credito')); c = db.session.get(CuentaAhorros, d.get('id_cuenta_origen'))
    if not cr or not c: return jsonify({"error": "Datos inválidos"}), 404
    m = float(d.get('monto'))
    if m > cr.saldo_pendiente: m = cr.saldo_pendiente
    ok, msg, imp = ejecutar_retiro(c, m)
    if not ok: return jsonify({"error": msg}), 400
    cr.saldo_pendiente -= m; db.session.commit(); log_action_lifo(f"Cajero abonó ${m} a crédito {cr.id}")
    return jsonify({"success": True, "mensaje": "Abono exitoso"})

@app.route('/cajero/pagar_tarjeta', methods=['POST'])
@cajero_login_required
def cajero_pagar_tarjeta():
    d = request.json; t = db.session.get(TarjetaCredito, d.get('id_tarjeta')); c = db.session.get(CuentaAhorros, d.get('id_cuenta_origen'))
    if not t or not c: return jsonify({"error": "Datos inválidos"}), 404
    m = float(d.get('monto'))
    if m > t.cupo_usado: m = t.cupo_usado
    ok, msg, imp = ejecutar_retiro(c, m)
    if not ok: return jsonify({"error": msg}), 400
    t.cupo_usado -= m; db.session.commit(); log_action_lifo(f"Cajero pagó ${m} a tarjeta {t.id}")
    return jsonify({"success": True, "mensaje": "Pago exitoso"})

@app.route('/cajero/realizar_avance', methods=['POST'])
@cajero_login_required
def cajero_realizar_avance():
    d = request.json; t = db.session.get(TarjetaCredito, d.get('id_tarjeta')); c = db.session.get(CuentaAhorros, d.get('id_cuenta_destino'))
    if not t or not c: return jsonify({"error": "Datos inválidos"}), 404
    m = float(d.get('monto'))
    if (t.cupo_total - t.cupo_usado) < m: return jsonify({"error": "Cupo insuficiente"}), 400
    t.cupo_usado += m; c.saldo += m
    db.session.add(Transaccion(tipo=TipoTransaccion.CONSIGNACION, monto=m, cuenta_id=c.id)); db.session.commit()
    return jsonify({"success": True, "mensaje": "Avance exitoso"})

@app.route('/cajero/marcar_exenta', methods=['POST'])
@cajero_login_required
def cajero_marcar_exenta():
    c = db.session.get(CuentaAhorros, request.json.get('id_cuenta'))
    if not c: return jsonify({"error": "Cuenta inválida"}), 404
    cliente = c.cliente
    for cuenta in cliente.cuentas_ahorros: cuenta.exenta_4x1000 = False
    c.exenta_4x1000 = True; db.session.commit()
    return jsonify({"success": True, "mensaje": "Cuenta marcada como exenta"})

@app.route('/cajero/cuenta/<int:id_cuenta>/transacciones', methods=['GET'])
@cajero_login_required
def cajero_get_transacciones(id_cuenta):
    c = db.session.get(CuentaAhorros, id_cuenta)
    trans = db.session.scalars(db.select(Transaccion).where(Transaccion.cuenta_id==id_cuenta).order_by(Transaccion.fecha.desc())).all()
    return jsonify([{"tipo": t.tipo.value, "monto": t.monto, "fecha": t.fecha.strftime("%Y-%m-%d %H:%M")} for t in trans])

@app.route('/cajero/credito/<int:id_credito>/amortizacion', methods=['GET'])
@cajero_login_required
def cajero_get_amortizacion(id_credito):
    cred = db.session.get(Credito, id_credito)
    cuota, tabla = calcular_tabla_amortizacion(cred.monto_aprobado, cred.tasa_interes_anual, cred.plazo_meses)
    return jsonify({"cuota_fija_mensual": round(cuota, 2), "tabla_amortizacion": tabla})

@app.route('/cajero/historial/ver', methods=['GET'])
@cajero_login_required
def historial_cajero():
    return jsonify({"historial": list(reversed(session.get('historial_acciones_cajero', [])))})

@app.cli.command("seed-db")
def seed_db():
    if not db.session.scalar(db.select(Cajero).where(Cajero.email == 'cajero@banco.com')):
        db.session.add(Cajero(email='cajero@banco.com', nombre='Cajero 1', password_hash=generate_password_hash('cajero123')))
    if not db.session.scalar(db.select(Cliente).where(Cliente.email == 'cliente@test.com')):
        c = Cliente(nombre_completo='Cliente Test', email='cliente@test.com', password_hash=generate_password_hash('cliente123'), fecha_nacimiento=datetime.date(1990,1,1), tipo_cliente=TipoCliente.AFILIADO)
        db.session.add(c); db.session.commit(); db.session.refresh(c)
        db.session.add(CuentaAhorros(numero_cuenta="001-A", saldo=1000000, cliente_id=c.id, exenta_4x1000=False))
    db.session.commit(); print("DB Seeded")

if __name__ == '__main__':
    app.run(debug=True)