# utils.py
import functools
from flask import request, session, jsonify, redirect, url_for # <-- ¡CORREGIDO! request fue añadido aquí
from models import Cliente, db
import datetime

# --- Lógica Pura (Amortización) ---

def calcular_tabla_amortizacion(monto_prestamo: float, tasa_interes_anual: float, plazo_meses: int):
    # (Esta función es exactamente la misma que te di antes, es lógica pura)
    if tasa_interes_anual <= 0 or plazo_meses <= 0:
        return None, []
    
    tasa_interes_mensual = (tasa_interes_anual / 12)
    
    if tasa_interes_mensual > 0:
        cuota_fija = monto_prestamo * (
            (tasa_interes_mensual * (1 + tasa_interes_mensual)**plazo_meses) /
            (((1 + tasa_interes_mensual)**plazo_meses) - 1)
        )
    else:
        cuota_fija = monto_prestamo / plazo_meses

    tabla = []
    saldo_pendiente = monto_prestamo
    
    for mes in range(1, plazo_meses + 1):
        interes_pagado = saldo_pendiente * tasa_interes_mensual
        abono_capital = cuota_fija - interes_pagado
        saldo_pendiente -= abono_capital
        
        if mes == plazo_meses and abs(saldo_pendiente) < 0.01:
            saldo_pendiente = 0.0

        tabla.append({
            "mes": mes,
            "cuota": round(cuota_fija, 2),
            "interes": round(interes_pagado, 2),
            "capital": round(abono_capital, 2),
            "saldo_restante": round(saldo_pendiente, 2)
        })
        
    return cuota_fija, tabla

# --- Decoradores de Autenticación ---

def login_required(f):
    """
    Decorador para rutas que requieren que un CLIENTE haya iniciado sesión.
    Revisa 'cliente_id' en la sesión.
    """
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        if 'cliente_id' not in session:
            # Si es una petición de API (JSON), devuelve error JSON
            # Aquí se usa 'request', por eso se debe importar
            if request.accept_mimetypes.best_match(['application/json']) == 'application/json':
                return jsonify({"error": "No autorizado. Inicie sesión."}), 401
            # Si es una petición de página, redirige al login
            return redirect(url_for('login_page'))
        
        return f(*args, **kwargs)
    return decorated_function

# --- ¡NUEVO DECORADOR! ---
def cajero_login_required(f):
    """
    Decorador para rutas que requieren que un CAJERO haya iniciado sesión.
    Revisa 'cajero_id' en la sesión.
    """
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        if 'cajero_id' not in session:
            # Si es una petición de API (JSON), devuelve error JSON
            # Aquí también se usa 'request'
            if request.accept_mimetypes.best_match(['application/json']) == 'application/json':
                return jsonify({"error": "Acceso de cajero no autorizado."}), 401
            # Si es una petición de página, redirige al login de cajero
            return redirect(url_for('cajero_login_page'))
        
        return f(*args, **kwargs)
    return decorated_function


# --- Funciones de Sesión (LIFO) ---

def log_action_lifo(accion: str):
    """Añade una acción al historial LIFO en la sesión (para cajero o cliente)."""
    
    # Determina qué historial usar
    if 'cajero_id' in session:
        key = 'historial_acciones_cajero'
    elif 'cliente_id' in session:
        key = 'historial_acciones'
    else:
        return # No hay sesión, no hay log

    if key not in session:
        session[key] = []
    
    session[key].append(f"{datetime.datetime.now()}: {accion}")
    # ¡Importante! Debes marcar la sesión como modificada al cambiar listas/dict
    session.modified = True

def pop_action_lifo():
    """Saca la última acción del historial LIFO (usado por el cajero)."""
    # (Esta función solo la usa el cajero en nuestro diseño)
    key = 'historial_acciones_cajero'
    if key in session and len(session[key]) > 0:
        accion = session[key].pop()
        session.modified = True
        return accion
    return None