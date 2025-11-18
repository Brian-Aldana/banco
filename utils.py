import functools
from flask import request, session, jsonify, redirect, url_for
from models import Cliente, db
import datetime

def calcular_tabla_amortizacion(monto_prestamo: float, tasa_interes_anual: float, plazo_meses: int):
    if tasa_interes_anual <= 0 or plazo_meses <= 0: return None, []
    tasa_interes_mensual = (tasa_interes_anual / 12)
    if tasa_interes_mensual > 0:
        cuota_fija = monto_prestamo * ((tasa_interes_mensual * (1 + tasa_interes_mensual)**plazo_meses) / (((1 + tasa_interes_mensual)**plazo_meses) - 1))
    else:
        cuota_fija = monto_prestamo / plazo_meses
    tabla = []
    saldo_pendiente = monto_prestamo
    for mes in range(1, plazo_meses + 1):
        interes_pagado = saldo_pendiente * tasa_interes_mensual
        abono_capital = cuota_fija - interes_pagado
        saldo_pendiente -= abono_capital
        if mes == plazo_meses and abs(saldo_pendiente) < 0.01: saldo_pendiente = 0.0
        tabla.append({"mes": mes, "cuota": round(cuota_fija, 2), "interes": round(interes_pagado, 2), "capital": round(abono_capital, 2), "saldo_restante": round(saldo_pendiente, 2)})
    return cuota_fija, tabla

def login_required(f):
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        if 'cliente_id' not in session:
            if request.accept_mimetypes.best_match(['application/json']) == 'application/json':
                return jsonify({"error": "No autorizado."}), 401
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated_function

def cajero_login_required(f):
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        if 'cajero_id' not in session:
            if request.accept_mimetypes.best_match(['application/json']) == 'application/json':
                return jsonify({"error": "No autorizado."}), 401
            return redirect(url_for('cajero_login_page'))
        return f(*args, **kwargs)
    return decorated_function

def log_action_lifo(accion: str):
    key = 'historial_acciones_cajero' if 'cajero_id' in session else 'historial_acciones'
    if key not in session: session[key] = []
    session[key].append(f"{datetime.datetime.now().strftime('%H:%M:%S')}: {accion}")
    session.modified = True