document.addEventListener('DOMContentLoaded', () => {
    const btnLlamar = document.getElementById('btn-llamar-siguiente');
    const turnoDisplay = document.getElementById('turno-actual-display');
    const turnoNombre = document.getElementById('turno-actual-nombre');
    const clientePanel = document.getElementById('cliente-info');
    const modal = document.getElementById('cajero-modal');
    const modalTitle = document.getElementById('modal-title');
    let CLIENTE_ID = null, CUENTAS_CACHE = [];

    btnLlamar.onclick = async () => {
        try {
            const res = await fetch('/filas/llamar_siguiente'); const data = await res.json();
            if(res.ok) {
                turnoDisplay.textContent = data.turno_llamado.numero_turno; turnoNombre.textContent = data.turno_llamado.nombre;
                if(data.turno_llamado.id_cliente) await cargarClienteId(data.turno_llamado.id_cliente);
                else { limpiarCliente(); mostrarOpcionesNoAfiliado(data.turno_llamado.nombre); }
            } else alert(data.mensaje);
            actualizarFilas();
        } catch(e) {}
    };
    document.getElementById('form-buscar-cliente').onsubmit = (e) => { e.preventDefault(); cargarClienteTerm(document.getElementById('search_term').value); };
    async function cargarClienteId(id) { return cargarClienteTerm(String(id)); }
    async function cargarClienteTerm(term) {
        const res = await fetch(`/cajero/buscar_cliente?t=${Date.now()}`, { method:'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({search_term: term})});
        const data = await res.json();
        if(res.ok) renderCliente(data); else { alert(data.error); limpiarCliente(); }
    }
    function renderCliente(data) {
        CLIENTE_ID = data.id; CUENTAS_CACHE = data.cuentas_ahorros;
        document.getElementById('cliente-nombre').textContent = data.nombre_completo; document.getElementById('cliente-email').textContent = data.email; document.getElementById('cliente-tipo').textContent = data.tipo_cliente;
        clientePanel.style.display = 'block'; document.getElementById('opciones-no-afiliado').style.display = 'none'; document.getElementById('panel-productos').style.display = 'block'; document.getElementById('area-afiliar').style.display = data.tipo_cliente === 'NO_AFILIADO' ? 'block' : 'none';
        renderProductos(data);
    }
    function renderProductos(data) {
        const cc = document.getElementById('cuentas-container'); cc.innerHTML='';
        if(data.cuentas_ahorros.length===0) cc.innerHTML='<p style="color:#666">Sin cuentas</p>';
        data.cuentas_ahorros.forEach(c => {
            cc.innerHTML += `<div class="card producto-card"><h4>${c.numero_cuenta} ${c.exenta_4x1000 ? '<span class="exenta-badge">Exenta</span>' : ''}</h4><div class="saldo">$${c.saldo.toLocaleString()}</div><div class="operacion-item"><input id="monto-c-${c.id}" class="form-control" placeholder="Monto"><button class="btn btn-verde btn-small" onclick="opCajero('consignar', ${c.id})">Consignar</button><button class="btn btn-rojo btn-small" onclick="opCajero('retirar', ${c.id})">Retirar</button></div><div class="card-acciones"><button class="btn btn-info btn-small" onclick="verMovimientos(${c.id}, '${c.numero_cuenta}')">Movimientos</button><button class="btn btn-info btn-small" onclick="abrirModalTransferir()">Transferir</button>${!c.exenta_4x1000 ? `<button class="btn btn-secondary btn-small" onclick="marcarExenta(${c.id})">Marcar Exenta</button>` : ''}<button class="btn btn-gris btn-small" onclick="cancelarCuenta(${c.id})">Cancelar</button></div></div>`;
        });
        const cr = document.getElementById('creditos-container'); cr.innerHTML='';
        if(data.creditos.length===0) cr.innerHTML='<p style="color:#666">Sin créditos</p>';
        data.creditos.forEach(c => {
            const tasa = c.tasa_interes_anual ? (c.tasa_interes_anual * 100).toFixed(2) : '0.00';
            cr.innerHTML += `<div class="card producto-card"><h4>${c.tipo_credito}</h4><p>Deuda: <strong>$${c.saldo_pendiente.toLocaleString()}</strong></p><p style="font-size:0.9rem; color:#666;">Tasa: ${tasa}% E.A.</p><div class="card-acciones"><button class="btn btn-verde btn-small" onclick="abrirModalPagarCredito(${c.id})">Abonar</button><button class="btn btn-secondary btn-small" onclick="verAmortizacion(${c.id})">Amortización</button></div></div>`;
        });
        const tj = document.getElementById('tarjetas-container'); tj.innerHTML='';
        if(data.tarjetas_credito.length===0) tj.innerHTML='<p style="color:#666">Sin tarjetas</p>';
        data.tarjetas_credito.forEach(t => {
             const tasa = t.tasa_interes_mensual ? (t.tasa_interes_mensual * 100).toFixed(2) : '0.00';
             const cupoUsado = t.cupo_usado < 0 ? 0 : t.cupo_usado; 
             let btnPagar = cupoUsado > 0 ? `<button class="btn btn-verde btn-small" onclick="abrirModalPagarTarjeta(${t.id}, ${cupoUsado})">Pagar</button>` : `<span style="color:green;font-weight:bold">Al día</span>`;
             tj.innerHTML += `<div class="card producto-card"><h4>Tarjeta **** ${t.numero_tarjeta.slice(-4)}</h4><p>Usado: $${cupoUsado.toLocaleString()} / <strong>Cupo: $${t.cupo_total.toLocaleString()}</strong></p><p style="font-size:0.9rem; color:#666;">Tasa Mes: ${tasa}%</p><div class="card-acciones">${btnPagar}<button class="btn btn-info btn-small" onclick="abrirModalAvance(${t.id}, ${t.cupo_total-t.cupo_usado})">Avance</button><button class="btn btn-gris btn-small" onclick="eliminarTarjeta(${t.id})">Eliminar</button></div></div>`;
        });
        const cd = document.getElementById('cdts-container'); cd.innerHTML='';
        if(data.cdts.length===0) cd.innerHTML='<p style="color:#666">Sin CDTs</p>';
        data.cdts.forEach(c => {
            const tasa = c.tasa_interes_anual ? (c.tasa_interes_anual * 100).toFixed(2) : '0.00';
            cd.innerHTML += `<div class="card producto-card"><h4>CDT</h4><p>Inversión: $${c.monto_inversion.toLocaleString()}</p><p style="font-size:0.9rem; color:#666;">Plazo: ${c.plazo_dias} días | Tasa: ${tasa}% E.A.</p></div>`;
        });
    }

    function mostrarOpcionesNoAfiliado(nombre) {
        clientePanel.style.display = 'block'; document.getElementById('panel-productos').style.display = 'none'; document.getElementById('opciones-no-afiliado').style.display = 'block'; document.getElementById('cliente-nombre').textContent = nombre; document.getElementById('cliente-email').textContent = "No Registrado";
        document.getElementById('btn-anon-consignar').onclick = () => { const n=prompt("Cuenta destino:"); const m=prompt("Monto:"); if(n&&m) fetch('/cajero/consignar_tercero', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({numero_cuenta:n, monto:parseFloat(m)})}).then(r=>r.json()).then(d=>alert(d.mensaje||d.error)); };
        document.getElementById('btn-anon-registrar').onclick = () => abrirModalCrear('registrar_cliente');
    }
    function limpiarCliente() { CLIENTE_ID = null; clientePanel.style.display = 'none'; document.getElementById('search_term').value = ''; CUENTAS_CACHE = []; }
    document.getElementById('btn-limpiar-cliente').onclick = limpiarCliente;
    window.opCajero = async (tipo, id) => { const m = document.getElementById(`monto-c-${id}`).value; if(!m) return alert("Ingrese monto"); const url = tipo === 'consignar' ? '/cajero/realizar_consignacion' : '/cajero/realizar_retiro'; const res = await fetch(url, { method:'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id_cuenta: id, monto: parseFloat(m)})}); const d = await res.json(); alert(d.mensaje||d.error); if(res.ok) await cargarClienteId(CLIENTE_ID); };
    window.cancelarCuenta = async (id) => { if(confirm("Eliminar?")) { const res = await fetch('/cajero/cancelar_cuenta', { method:'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id_cuenta: id})}); const d = await res.json(); alert(d.mensaje||d.error); if(res.ok) await cargarClienteId(CLIENTE_ID); } };
    window.eliminarTarjeta = async (id) => { if(confirm("Eliminar?")) { const res = await fetch('/cajero/eliminar_tarjeta', { method:'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id_tarjeta: id})}); const d = await res.json(); alert(d.mensaje||d.error); if(res.ok) await cargarClienteId(CLIENTE_ID); } };
    window.marcarExenta = async (id) => { const res = await fetch('/cajero/marcar_exenta', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id_cuenta: id})}); if(res.ok) { alert("Cuenta marcada exenta"); await cargarClienteId(CLIENTE_ID); } };
    document.getElementById('btn-afiliar-cliente').onclick = async () => { await fetch('/cajero/afiliar_cliente', { method:'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: document.getElementById('cliente-email').textContent, nombre_completo: document.getElementById('cliente-nombre').textContent, fecha_nacimiento: "1990-01-01"})}); await cargarClienteId(CLIENTE_ID); };

    window.verMovimientos = async (id, num) => {
        const res = await fetch(`/cajero/cuenta/${id}/transacciones`);
        const data = await res.json();
        const lista = document.getElementById('transaccion-lista');
        lista.innerHTML = ''; if(data.length===0) lista.innerHTML='<li>Sin movimientos</li>';
        data.forEach(t => { const esDebito = (t.tipo === 'Retiro' || t.tipo === 'Pago'); const tipoTexto = t.tipo === 'Pago' ? 'Impuesto 4x1000' : t.tipo; const color = esDebito ? '#e53935' : '#43a047'; const signo = esDebito ? '-' : '+'; lista.innerHTML += `<li><div><strong style="font-size:1.1rem;">${tipoTexto}</strong><br><small style="color:#888;">${t.fecha}</small></div><span style="color:${color};font-weight:bold;font-size:1.1rem;">${signo}$${t.monto.toLocaleString()}</span></li>`; });
        document.getElementById('modal-transacciones').style.display = 'block';
    };
    window.verAmortizacion = async (id) => {
        const res = await fetch(`/cajero/credito/${id}/amortizacion`);
        const data = await res.json();
        document.getElementById('cuota-fija-display').textContent = `Cuota: $${data.cuota_fija_mensual.toLocaleString()}`;
        const tbody = document.getElementById('tabla-amortizacion-body'); tbody.innerHTML = '';
        data.tabla_amortizacion.forEach(f => { tbody.innerHTML += `<tr><td>${f.mes}</td><td>$${f.cuota.toLocaleString()}</td><td>$${f.interes.toLocaleString()}</td><td>$${f.capital.toLocaleString()}</td><td>$${f.saldo_restante.toLocaleString()}</td></tr>`; });
        document.getElementById('modal-amortizacion').style.display = 'block';
    };

    const poblar = (id) => { const s=document.getElementById(id); s.innerHTML=''; CUENTAS_CACHE.forEach(c=>s.innerHTML+=`<option value="${c.id}">${c.numero_cuenta} ($${c.saldo.toLocaleString()})</option>`); return CUENTAS_CACHE.length>0; };
    window.abrirModalCrear = (tipo) => {
        if(!CLIENTE_ID && tipo!=='registrar_cliente') return alert("No hay cliente");
        document.querySelectorAll('#modal-body form').forEach(f => f.style.display='none');
        modal.style.display='block';
        if(tipo === 'cuenta') { if(confirm("Crear cuenta?")) fetch('/cajero/crear_cuenta', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cliente_id: CLIENTE_ID})}).then(r=>r.json()).then(async d=>{alert(d.mensaje); await cargarClienteId(CLIENTE_ID); modal.style.display='none'}); }
        else if (tipo === 'credito') {
            if(!poblar('crear-credito-destino')) return alert("Necesita cuenta");
            document.getElementById('form-crear-credito').style.display='block';
            document.getElementById('form-crear-credito').onsubmit = async (e) => { e.preventDefault(); const res=await fetch('/cajero/solicitar_credito', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cliente_id: CLIENTE_ID, monto: parseFloat(document.getElementById('crear-credito-monto').value), plazo: parseInt(document.getElementById('crear-credito-plazo').value), tipo: document.getElementById('crear-credito-tipo').value, id_cuenta_destino: document.getElementById('crear-credito-destino').value})}); const d=await res.json(); alert(d.mensaje); if(res.ok){await cargarClienteId(CLIENTE_ID); modal.style.display='none';} };
        } else if (tipo === 'tarjeta') {
            document.getElementById('form-crear-tarjeta').style.display='block';
            document.getElementById('form-crear-tarjeta').onsubmit = async (e) => { e.preventDefault(); fetch('/cajero/solicitar_tarjeta', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cliente_id: CLIENTE_ID, cupo: parseFloat(document.getElementById('crear-tarjeta-cupo').value)})}).then(r=>r.json()).then(d=>{alert(d.mensaje); cargarClienteId(CLIENTE_ID); modal.style.display='none'}); }
        } else if (tipo === 'cdt') {
            if(!poblar('crear-cdt-origen')) return alert("Necesita cuenta");
            document.getElementById('form-crear-cdt').style.display='block';
            document.getElementById('form-crear-cdt').onsubmit = async (e) => { e.preventDefault(); const res=await fetch('/cajero/abrir_cdt', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cliente_id: CLIENTE_ID, monto: parseFloat(document.getElementById('crear-cdt-monto').value), plazo: parseInt(document.getElementById('crear-cdt-plazo').value), id_cuenta_origen: document.getElementById('crear-cdt-origen').value})}); const d=await res.json(); alert(d.mensaje||d.error); if(res.ok){await cargarClienteId(CLIENTE_ID); modal.style.display='none';} };
        } else if (tipo === 'registrar_cliente') {
            document.getElementById('form-registrar-cliente').style.display='block';
            document.getElementById('form-registrar-cliente').onsubmit = async (e) => {
                e.preventDefault();
                const d = { nombre_completo: document.getElementById('reg-nombre').value, email: document.getElementById('reg-email').value, password: document.getElementById('reg-pass').value, fecha_nacimiento: document.getElementById('reg-fecha').value };
                const res=await fetch('/cajero/afiliar_cliente', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d)}); const r=await res.json(); if(r.id_cliente){alert("Registrado!"); await cargarClienteId(r.id_cliente); modal.style.display='none';} else alert(r.error);
            }
        }
    };
    window.abrirModalTransferir = () => { document.querySelectorAll('#modal-body form').forEach(f => f.style.display='none'); modal.style.display='block'; document.getElementById('form-transferir-cajero').style.display='block'; poblar('trans-origen'); poblar('trans-destino'); document.getElementById('form-transferir-cajero').onsubmit = async (e) => { e.preventDefault(); const res=await fetch('/cajero/transferir', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id_cuenta_origen: document.getElementById('trans-origen').value, id_cuenta_destino: document.getElementById('trans-destino').value, monto: parseFloat(document.getElementById('trans-monto').value)})}); const d=await res.json(); alert(d.mensaje||d.error); if(d.success){await cargarClienteId(CLIENTE_ID); modal.style.display='none';} }; };
    window.abrirModalPagarCredito = (id) => { document.querySelectorAll('#modal-body form').forEach(f => f.style.display='none'); modal.style.display='block'; document.getElementById('form-pagar-credito-cajero').style.display='block'; poblar('pagar-credito-origen'); document.getElementById('form-pagar-credito-cajero').onsubmit = async (e) => { e.preventDefault(); const res=await fetch('/cajero/pagar_credito', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id_credito: id, id_cuenta_origen: document.getElementById('pagar-credito-origen').value, monto: parseFloat(document.getElementById('pagar-credito-monto').value)})}); const d=await res.json(); alert(d.mensaje||d.error); if(d.success){await cargarClienteId(CLIENTE_ID); modal.style.display='none';} }; };
    window.abrirModalPagarTarjeta = (id) => { document.querySelectorAll('#modal-body form').forEach(f => f.style.display='none'); modal.style.display='block'; document.getElementById('form-pagar-tarjeta-cajero').style.display='block'; poblar('pagar-tarjeta-origen'); document.getElementById('form-pagar-tarjeta-cajero').onsubmit = async (e) => { e.preventDefault(); const res=await fetch('/cajero/pagar_tarjeta', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id_tarjeta: id, id_cuenta_origen: document.getElementById('pagar-tarjeta-origen').value, monto: parseFloat(document.getElementById('pagar-tarjeta-monto').value)})}); const d=await res.json(); alert(d.mensaje||d.error); if(d.success){await cargarClienteId(CLIENTE_ID); modal.style.display='none';} }; };
    window.abrirModalAvance = (id, disp) => { document.querySelectorAll('#modal-body form').forEach(f => f.style.display='none'); modal.style.display='block'; document.getElementById('form-avance-cajero').style.display='block'; poblar('avance-destino'); document.getElementById('form-avance-cajero').onsubmit = async (e) => { e.preventDefault(); const res=await fetch('/cajero/realizar_avance', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id_tarjeta: id, id_cuenta_destino: document.getElementById('avance-destino').value, monto: parseFloat(document.getElementById('avance-monto').value)})}); const d=await res.json(); alert(d.mensaje||d.error); if(d.success){await cargarClienteId(CLIENTE_ID); modal.style.display='none';} }; };
    document.querySelectorAll('.close-modal').forEach(x => x.onclick = () => { modal.style.display='none'; document.getElementById('modal-transacciones').style.display='none'; document.getElementById('modal-amortizacion').style.display='none'; });
    document.getElementById('logout-button').onclick = async () => { await fetch('/cajero/logout', {method:'POST'}); window.location.href='/'; };
    async function actualizarFilas() { const d = await (await fetch('/filas/estado_actual')).json(); document.getElementById('lista-preferencial').textContent = `Pref: ${d.fila_preferencial.length}`; document.getElementById('lista-afiliado').textContent = `Afil: ${d.fila_afiliado.length}`; document.getElementById('lista-no_afiliado').textContent = `No Afil: ${d.fila_no_afiliado.length}`; const h = await (await fetch('/cajero/historial/ver')).json(); const hl = document.getElementById('historial-lifo'); hl.innerHTML=''; h.historial.forEach(x => hl.innerHTML+=`<li>${x}</li>`); }
    setInterval(actualizarFilas, 5000);
});