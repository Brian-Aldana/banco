document.addEventListener('DOMContentLoaded', () => {
    const btnLlamar = document.getElementById('btn-llamar-siguiente');
    const turnoDisplay = document.getElementById('turno-actual-display');
    const turnoNombre = document.getElementById('turno-actual-nombre');
    const clientePanel = document.getElementById('cliente-info');
    const modal = document.getElementById('cajero-modal');
    const modalTitle = document.getElementById('modal-title');
    
    let CLIENTE_ID = null;
    let CUENTAS_CACHE = []; // Necesario para poblar selects de transferencia/pago

    // Llamar Turno y Auto-Cargar
    btnLlamar.onclick = async () => {
        try {
            const res = await fetch('/filas/llamar_siguiente');
            const data = await res.json();
            if(res.ok) {
                const turno = data.turno_llamado;
                turnoDisplay.textContent = turno.numero_turno;
                turnoNombre.textContent = turno.nombre;
                if(turno.id_cliente) cargarClienteId(turno.id_cliente);
                else { limpiarCliente(); mostrarOpcionesNoAfiliado(turno.nombre); }
            } else alert(data.mensaje);
            actualizarFilas();
        } catch(e) {}
    };

    document.getElementById('form-buscar-cliente').onsubmit = (e) => {
        e.preventDefault();
        cargarClienteTerm(document.getElementById('search_term').value);
    };

    async function cargarClienteId(id) { return cargarClienteTerm(id); }
    async function cargarClienteTerm(term) {
        const res = await fetch('/cajero/buscar_cliente', { method:'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({search_term: term})});
        const data = await res.json();
        if(res.ok) renderCliente(data); else { alert(data.error); limpiarCliente(); }
    }

    function renderCliente(data) {
        CLIENTE_ID = data.id;
        CUENTAS_CACHE = data.cuentas_ahorros;
        document.getElementById('cliente-nombre').textContent = data.nombre_completo;
        document.getElementById('cliente-email').textContent = data.email;
        document.getElementById('cliente-tipo').textContent = data.tipo_cliente;
        
        clientePanel.style.display = 'block';
        document.getElementById('opciones-no-afiliado').style.display = 'none';
        document.getElementById('panel-productos').style.display = 'block';
        document.getElementById('area-afiliar').style.display = data.tipo_cliente === 'NO_AFILIADO' ? 'block' : 'none';

        const cc = document.getElementById('cuentas-container'); cc.innerHTML='';
        data.cuentas_ahorros.forEach(c => {
            cc.innerHTML += `<div class="card producto-card"><h4>${c.numero_cuenta}</h4><div class="saldo">$${c.saldo.toLocaleString()}</div><div class="operacion-item"><input id="monto-c-${c.id}" class="form-control" placeholder="Monto"><button class="btn btn-verde btn-small" onclick="opCajero('consignar', ${c.id})">Consignar</button><button class="btn btn-rojo btn-small" onclick="opCajero('retirar', ${c.id})">Retirar</button></div><div class="card-acciones"><button class="btn btn-info btn-small" onclick="abrirModalTransferir()">Transferir</button><button class="btn btn-gris btn-small" onclick="cancelarCuenta(${c.id})">Cancelar</button></div></div>`;
        });

        const cr = document.getElementById('creditos-container'); cr.innerHTML='';
        data.creditos.forEach(c => {
            cr.innerHTML += `<div class="card producto-card"><h4>${c.tipo_credito}</h4><p>Deuda: $${c.saldo_pendiente.toLocaleString()}</p><div class="card-acciones"><button class="btn btn-verde btn-small" onclick="abrirModalPagarCredito(${c.id})">Abonar</button></div></div>`;
        });

        const tj = document.getElementById('tarjetas-container'); tj.innerHTML='';
        data.tarjetas_credito.forEach(t => {
            tj.innerHTML += `<div class="card producto-card"><h4>Tarjeta ${t.numero_tarjeta.slice(-4)}</h4><p>Usado: $${t.cupo_usado.toLocaleString()}</p><div class="card-acciones"><button class="btn btn-verde btn-small" onclick="abrirModalPagarTarjeta(${t.id})">Pagar</button><button class="btn btn-info btn-small" onclick="abrirModalAvance(${t.id}, ${t.cupo_total-t.cupo_usado})">Avance</button></div></div>`;
        });
        
        const cd = document.getElementById('cdts-container'); cd.innerHTML='';
        data.cdts.forEach(c => cd.innerHTML += `<div class="card producto-card"><h4>CDT</h4><p>Inv: $${c.monto_inversion.toLocaleString()}</p></div>`);
    }

    function mostrarOpcionesNoAfiliado(nombre) {
        clientePanel.style.display = 'block';
        document.getElementById('panel-productos').style.display = 'none';
        document.getElementById('opciones-no-afiliado').style.display = 'block';
        document.getElementById('cliente-nombre').textContent = nombre;
        document.getElementById('cliente-email').textContent = "No Registrado";
        document.getElementById('btn-anon-consignar').onclick = () => {
            const n=prompt("Cuenta destino:"); const m=prompt("Monto:");
            if(n&&m) fetch('/cajero/consignar_tercero', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({numero_cuenta:n, monto:parseFloat(m)})}).then(r=>r.json()).then(d=>alert(d.mensaje||d.error));
        };
        document.getElementById('btn-anon-registrar').onclick = () => alert("Use formulario de registro");
    }

    function limpiarCliente() { CLIENTE_ID = null; clientePanel.style.display = 'none'; document.getElementById('search_term').value = ''; }
    document.getElementById('btn-limpiar-cliente').onclick = limpiarCliente;

    window.opCajero = async (tipo, id) => {
        const m = document.getElementById(`monto-c-${id}`).value;
        const url = tipo === 'consignar' ? '/cajero/realizar_consignacion' : '/cajero/realizar_retiro';
        const res = await fetch(url, { method:'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id_cuenta: id, monto: parseFloat(m)})});
        const d = await res.json(); alert(d.mensaje||d.error); if(res.ok) cargarClienteId(CLIENTE_ID);
    };
    window.cancelarCuenta = async (id) => {
         if(!confirm("Eliminar?")) return;
         const res = await fetch('/cajero/cancelar_cuenta', { method:'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id_cuenta: id})});
         const d = await res.json(); alert(d.mensaje||d.error); if(res.ok) cargarClienteId(CLIENTE_ID);
    };
    document.getElementById('btn-afiliar-cliente').onclick = async () => {
        await fetch('/cajero/afiliar_cliente', { method:'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: document.getElementById('cliente-email').textContent, nombre_completo: document.getElementById('cliente-nombre').textContent, fecha_nacimiento: "1990-01-01"})});
        cargarClienteId(CLIENTE_ID);
    };

    // --- Modales del Cajero (Replicando funciones del cliente) ---
    const poblar = (id) => { const s=document.getElementById(id); s.innerHTML=''; CUENTAS_CACHE.forEach(c=>s.innerHTML+=`<option value="${c.id}">${c.numero_cuenta} ($${c.saldo})</option>`); return CUENTAS_CACHE.length>0; };

    window.abrirModalCrear = (tipo) => {
        document.querySelectorAll('#modal-body form').forEach(f => f.style.display='none');
        modal.style.display='block';
        if(tipo === 'cuenta') {
            if(confirm("Crear cuenta?")) fetch('/cajero/crear_cuenta', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cliente_id: CLIENTE_ID})}).then(r=>r.json()).then(d=>{alert(d.mensaje); cargarClienteId(CLIENTE_ID); modal.style.display='none'});
        } else if (tipo === 'credito') {
            document.getElementById('form-crear-credito').style.display='block';
            document.getElementById('form-crear-credito').onsubmit = (e) => { e.preventDefault(); fetch('/cajero/solicitar_credito', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cliente_id: CLIENTE_ID, monto: parseFloat(document.getElementById('crear-credito-monto').value), plazo: parseInt(document.getElementById('crear-credito-plazo').value), tipo: document.getElementById('crear-credito-tipo').value})}).then(r=>r.json()).then(d=>{alert(d.mensaje); cargarClienteId(CLIENTE_ID); modal.style.display='none'}); }
        } else if (tipo === 'tarjeta') {
            document.getElementById('form-crear-tarjeta').style.display='block';
            document.getElementById('form-crear-tarjeta').onsubmit = (e) => { e.preventDefault(); fetch('/cajero/solicitar_tarjeta', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cliente_id: CLIENTE_ID, cupo: parseFloat(document.getElementById('crear-tarjeta-cupo').value)})}).then(r=>r.json()).then(d=>{alert(d.mensaje); cargarClienteId(CLIENTE_ID); modal.style.display='none'}); }
        } else if (tipo === 'cdt') {
            poblar('crear-cdt-origen');
            document.getElementById('form-crear-cdt').style.display='block';
            document.getElementById('form-crear-cdt').onsubmit = (e) => { e.preventDefault(); fetch('/cajero/abrir_cdt', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cliente_id: CLIENTE_ID, monto: parseFloat(document.getElementById('crear-cdt-monto').value), plazo: parseInt(document.getElementById('crear-cdt-plazo').value), id_cuenta_origen: document.getElementById('crear-cdt-origen').value})}).then(r=>r.json()).then(d=>{alert(d.mensaje||d.error); if(d.success){cargarClienteId(CLIENTE_ID); modal.style.display='none'}}); }
        }
    };

    // Modales para Operaciones
    window.abrirModalTransferir = () => {
        document.querySelectorAll('#modal-body form').forEach(f => f.style.display='none');
        modal.style.display='block';
        document.getElementById('form-transferir-cajero').style.display='block';
        poblar('trans-origen'); poblar('trans-destino');
        document.getElementById('form-transferir-cajero').onsubmit = (e) => { e.preventDefault(); fetch('/cajero/transferir', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id_cuenta_origen: document.getElementById('trans-origen').value, id_cuenta_destino: document.getElementById('trans-destino').value, monto: parseFloat(document.getElementById('trans-monto').value)})}).then(r=>r.json()).then(d=>{alert(d.mensaje||d.error); if(d.success){cargarClienteId(CLIENTE_ID); modal.style.display='none'}}); };
    };
    window.abrirModalPagarCredito = (id) => {
        document.querySelectorAll('#modal-body form').forEach(f => f.style.display='none');
        modal.style.display='block';
        document.getElementById('form-pagar-credito-cajero').style.display='block';
        poblar('pagar-credito-origen');
        document.getElementById('form-pagar-credito-cajero').onsubmit = (e) => { e.preventDefault(); fetch('/cajero/pagar_credito', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id_credito: id, id_cuenta_origen: document.getElementById('pagar-credito-origen').value, monto: parseFloat(document.getElementById('pagar-credito-monto').value)})}).then(r=>r.json()).then(d=>{alert(d.mensaje||d.error); if(d.success){cargarClienteId(CLIENTE_ID); modal.style.display='none'}}); };
    };
    window.abrirModalPagarTarjeta = (id) => {
        document.querySelectorAll('#modal-body form').forEach(f => f.style.display='none');
        modal.style.display='block';
        document.getElementById('form-pagar-tarjeta-cajero').style.display='block';
        poblar('pagar-tarjeta-origen');
        document.getElementById('form-pagar-tarjeta-cajero').onsubmit = (e) => { e.preventDefault(); fetch('/cajero/pagar_tarjeta', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id_tarjeta: id, id_cuenta_origen: document.getElementById('pagar-tarjeta-origen').value, monto: parseFloat(document.getElementById('pagar-tarjeta-monto').value)})}).then(r=>r.json()).then(d=>{alert(d.mensaje||d.error); if(d.success){cargarClienteId(CLIENTE_ID); modal.style.display='none'}}); };
    };
    window.abrirModalAvance = (id, disp) => {
        document.querySelectorAll('#modal-body form').forEach(f => f.style.display='none');
        modal.style.display='block';
        document.getElementById('form-avance-cajero').style.display='block';
        poblar('avance-destino');
        document.getElementById('form-avance-cajero').onsubmit = (e) => { e.preventDefault(); fetch('/cajero/realizar_avance', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id_tarjeta: id, id_cuenta_destino: document.getElementById('avance-destino').value, monto: parseFloat(document.getElementById('avance-monto').value)})}).then(r=>r.json()).then(d=>{alert(d.mensaje||d.error); if(d.success){cargarClienteId(CLIENTE_ID); modal.style.display='none'}}); };
    };

    document.querySelector('.close-modal').onclick = () => modal.style.display='none';
    document.getElementById('logout-button').onclick = async () => { await fetch('/cajero/logout', {method:'POST'}); window.location.href='/'; };

    async function actualizarFilas() {
         const d = await (await fetch('/filas/estado_actual')).json();
         document.getElementById('lista-preferencial').textContent = `Pref: ${d.fila_preferencial.length}`;
         document.getElementById('lista-afiliado').textContent = `Afil: ${d.fila_afiliado.length}`;
         document.getElementById('lista-no_afiliado').textContent = `No Afil: ${d.fila_no_afiliado.length}`;
         const h = await (await fetch('/cajero/historial/ver')).json();
         const hl = document.getElementById('historial-lifo'); hl.innerHTML='';
         h.historial.forEach(x => hl.innerHTML+=`<li>${x}</li>`);
    }
    setInterval(actualizarFilas, 5000);
});