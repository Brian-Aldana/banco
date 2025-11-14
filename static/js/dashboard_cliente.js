// static/js/dashboard_cliente.js
document.addEventListener('DOMContentLoaded', () => {

    // --- Selectores Principales ---
    const welcomeMessage = document.getElementById('welcome-message');
    const logoutButton = document.getElementById('logout-button');
    
    // --- Selectores Sidebar (Afiliación) ---
    const statusDisplay = document.getElementById('status-display');
    const afiliacionSection = document.getElementById('afiliacion-section');
    const btnAfiliarme = document.getElementById('btn-afiliarme');
    const message = document.getElementById('message');

    // --- Selectores Contenido (Productos) ---
    const cuentasContainer = document.getElementById('cuentas-container');
    const creditosContainer = document.getElementById('creditos-container');
    const tarjetasContainer = document.getElementById('tarjetas-container');
    const cdtsContainer = document.getElementById('cdts-container');

    // --- Selectores Modal Amortización ---
    const modalAmortizacion = document.getElementById('modal-amortizacion');
    const closeAmortizacionBtn = document.getElementById('close-amortizacion-btn');
    const cuotaFijaDisplay = document.getElementById('cuota-fija-display');
    const tablaAmortizacionBody = document.getElementById('tabla-amortizacion-body');

    // --- Selectores Modal Formularios ---
    const formModal = document.getElementById('form-modal');
    const closeFormBtn = document.getElementById('close-form-btn');
    const formModalTitle = document.getElementById('form-modal-title');
    const modalErrorMsg = document.getElementById('modal-error-msg');
    const modalSubmitBtn = document.getElementById('modal-submit-btn');
    
    const formTransferir = document.getElementById('form-transferir');
    const formCredito = document.getElementById('form-credito');
    const formTarjeta = document.getElementById('form-tarjeta');
    const formCdt = document.getElementById('form-cdt');
    const formAvance = document.getElementById('form-avance');
    const formPagarTarjeta = document.getElementById('form-pagar-tarjeta');
    
    // --- Selectores Modal Transacciones (LIFO) ---
    const modalTransacciones = document.getElementById('modal-transacciones');
    const closeTransaccionesBtn = document.getElementById('close-transacciones-btn');
    const transaccionesTitle = document.getElementById('transacciones-title');
    const transaccionLista = document.getElementById('transaccion-lista');
    
    // --- Almacén de estado local ---
    let misCuentas = [];
    let misTarjetas = [];

    // --- 1. Carga de Perfil y Productos ---
    async function cargarPerfilYProductos() {
        try {
            const response = await fetch('/cliente/perfil');
            if (!response.ok) {
                if (response.status === 401) window.location.href = '/login';
                throw new Error('No se pudo cargar el perfil.');
            }
            const data = await response.json();
            
            welcomeMessage.textContent = `Hola, ${data.nombre}`;
            
            misCuentas = data.cuentas_ahorros || [];
            misTarjetas = data.tarjetas_credito || [];
            
            renderStatus(data.tipo_cliente);
            renderCuentas(misCuentas);
            renderCreditos(data.creditos);
            renderTarjetas(misTarjetas);
            renderCDTs(data.cdts);

        } catch (error) {
            console.error('Error:', error);
            cuentasContainer.innerHTML = "<p>Error al cargar tus productos.</p>";
        }
    }

    // --- 2. Funciones de Renderizado ---
    function renderStatus(tipo_cliente) {
        if (tipo_cliente === 'Afiliado') {
            statusDisplay.textContent = 'AFILIADO';
            statusDisplay.className = 'status-badge afiliado';
            afiliacionSection.style.display = 'none';
            message.textContent = '¡Gracias por ser parte de nuestro banco!';
            message.style.color = 'green';
        } else {
            statusDisplay.textContent = 'NO AFILIADO';
            statusDisplay.className = 'status-badge no-afiliado';
            afiliacionSection.style.display = 'block';
        }
    }
    
    function renderCuentas(cuentas) {
        cuentasContainer.innerHTML = '';
        if (cuentas.length === 0) {
            cuentasContainer.innerHTML = '<p>No tienes cuentas de ahorro.</p>';
            return;
        }
        cuentas.forEach(cuenta => {
            cuentasContainer.innerHTML += `
                <div class="card producto-card">
                    <div class="saldo">$${formatCurrency(cuenta.saldo)}</div>
                    <div class="numero-cuenta">
                        Cuenta N°: ${cuenta.numero_cuenta}
                        ${cuenta.exenta_4x1000 ? '<span class="exenta-badge">4x1000 EXENTA</span>' : ''}
                    </div>
                    <div class="operacion-item">
                        <input type="number" id="monto-cuenta-${cuenta.id}" class="form-control" placeholder="Monto. Ej: 50000">
                        <button class="btn btn-small btn-verde" onclick="realizarOperacion('consignar', ${cuenta.id})">Meter</button>
                        <button class="btn btn-small btn-rojo" onclick="realizarOperacion('retirar', ${cuenta.id})">Sacar</button>
                    </div>
                    <div class="card-acciones" style="margin-top: 1rem;">
                        <button class="btn btn-small btn-info" onclick="verMovimientos(${cuenta.id}, '${cuenta.numero_cuenta}')">Ver Movimientos</button>
                        ${!cuenta.exenta_4x1000 ? `<button class="btn btn-small btn-pagar" onclick="marcarExenta(${cuenta.id})">Marcar Exenta</button>` : ''}
                        <button class="btn btn-small btn-cancelar" onclick="eliminarCuenta(${cuenta.id})">Eliminar Cuenta</button>
                    </div>
                </div>`;
        });
    }
    
    function renderCreditos(creditos) {
        creditosContainer.innerHTML = '';
        if (creditos.length === 0) {
            creditosContainer.innerHTML = '<p>No tienes créditos activos.</p>';
            return;
        }
        creditos.forEach(credito => {
            creditosContainer.innerHTML += `
                <div class="card producto-card">
                    <h4>Crédito: ${credito.tipo_credito}</h4>
                    <p>Saldo Pendiente: <strong>$${formatCurrency(credito.saldo_pendiente)}</strong></p>
                    <p>Monto Original: $${formatCurrency(credito.monto_aprobado)}</p>
                    <div class="operacion-item">
                        <input type="number" id="monto-credito-${credito.id}" class="form-control" placeholder="Monto a abonar">
                        <button class="btn btn-small btn-pagar" onclick="realizarPagoCredito(${credito.id})">Abonar</button>
                    </div>
                    <div class="card-acciones" style="margin-top: 1rem;">
                        <button class="btn btn-secondary btn-small" onclick="abrirModalAmortizacion(${credito.id})">Ver Amortización</button>
                    </div>
                </div>`;
        });
    }

    function renderTarjetas(tarjetas) {
        tarjetasContainer.innerHTML = '';
        if (tarjetas.length === 0) {
            tarjetasContainer.innerHTML = '<p>No tienes tarjetas de crédito.</p>';
            return;
        }
        tarjetas.forEach(t => {
            const cupo_disponible = t.cupo_total - t.cupo_usado;
            tarjetasContainer.innerHTML += `
                <div class="card producto-card">
                    <h4>Tarjeta de Crédito ${t.numero_tarjeta}</h4>
                    <p>Cupo Usado: <strong>$${formatCurrency(t.cupo_usado)}</strong> / $${formatCurrency(t.cupo_total)}</p>
                    <p>Tasa Interés Mensual: ${t.tasa_interes_mensual * 100}%</p>
                    <div class="card-acciones" style="margin-top: 1rem;">
                        <button class="btn btn-small btn-verde" onclick="abrirModalPagarTarjeta(${t.id}, ${t.cupo_usado})">Pagar Tarjeta</button>
                        <button class="btn btn-small btn-pagar" onclick="abrirModalAvance(${t.id}, ${cupo_disponible})">Realizar Avance</button>
                        <button class="btn btn-small btn-rojo" onclick="realizarCompra(${t.id})">Simular Compra</button>
                    </div>
                </div>`;
        });
    }

    function renderCDTs(cdts) {
        cdtsContainer.innerHTML = '';
        if (cdts.length === 0) {
            cdtsContainer.innerHTML = '<p>No tienes CDTs.</p>';
            return;
        }
        cdts.forEach(cdt => {
            cdtsContainer.innerHTML += `
                <div class="card producto-card">
                    <h4>CDT (ID: ${cdt.id})</h4>
                    <p>Inversión: <strong>$${formatCurrency(cdt.monto_inversion)}</strong></p>
                    <p>Plazo: ${cdt.plazo_dias} días (Tasa: ${cdt.tasa_interes_anual * 100}%)</p>
                </div>`;
        });
    }

    // --- 3. Lógica Afiliación y Logout ---
    btnAfiliarme.addEventListener('click', async () => {
        if (!confirm('¿Estás seguro que deseas volverte un cliente afiliado?')) return;
        try {
            const response = await fetch('/cliente/afiliarme', { method: 'POST' });
            const data = await response.json();
            if (response.ok) {
                message.textContent = '¡Felicidades! Ahora eres un cliente afiliado.';
                message.style.color = 'green';
                cargarPerfilYProductos();
            } else {
                message.textContent = `Error: ${data.error || 'Falló la solicitud.'}`;
                message.style.color = 'red';
            }
        } catch (error) {
            message.textContent = `Error: ${error.message}`;
            message.style.color = 'red';
        }
    });
    logoutButton.addEventListener('click', async (e) => {
        e.preventDefault();
        await fetch('/cliente/logout', { method: 'POST' });
        alert("Sesión cerrada. Serás redirigido al menú principal.");
        window.location.href = '/';
    });
    
    // --- 4. Lógica Modal Amortización ---
    window.abrirModalAmortizacion = async (id_credito) => {
        try {
            const response = await fetch(`/cliente/credito/${id_credito}/amortizacion`);
            if (!response.ok) { const data = await response.json(); alert(`Error: ${data.error}`); return; }
            const data = await response.json();
            cuotaFijaDisplay.textContent = `Cuota Fija Mensual: $${formatCurrency(data.cuota_fija_mensual)}`;
            tablaAmortizacionBody.innerHTML = '';
            data.tabla_amortizacion.forEach(fila => {
                tablaAmortizacionBody.innerHTML += `<tr><td>${fila.mes}</td><td>$${formatCurrency(fila.cuota)}</td><td>$${formatCurrency(fila.interes)}</td><td>$${formatCurrency(fila.capital)}</td><td>$${formatCurrency(fila.saldo_restante)}</td></tr>`;
            });
            modalAmortizacion.style.display = 'block';
        } catch (error) {
            alert("Error de red al cargar la amortización.");
        }
    }
    closeAmortizacionBtn.onclick = () => { modalAmortizacion.style.display = 'none'; }

    // --- 5. Lógica Modal Formularios ---
    window.abrirModal = (tipo) => {
        modalErrorMsg.style.display = 'none';
        formTransferir.style.display = 'none';
        formCredito.style.display = 'none';
        formTarjeta.style.display = 'none';
        formCdt.style.display = 'none';
        formAvance.style.display = 'none';
        formPagarTarjeta.style.display = 'none';
        
        const poblarSelectCuentas = (selectId) => {
            const selectEl = document.getElementById(selectId);
            selectEl.innerHTML = '';
            if (misCuentas.length === 0) {
                selectEl.innerHTML = '<option value="">No tienes cuentas</option>';
                return false;
            }
            misCuentas.forEach(cuenta => {
                selectEl.innerHTML += `<option value="${cuenta.id}">
                    ${cuenta.numero_cuenta} (Saldo: $${formatCurrency(cuenta.saldo)})
                </option>`;
            });
            return true;
        };

        if (tipo === 'cuenta') {
            crearCuentaAhorros();
            return;
        } else if (tipo === 'transferir') {
            if (!poblarSelectCuentas('transfer-cuenta-origen') || !poblarSelectCuentas('transfer-cuenta-destino')) {
                alert("Necesitas al menos una cuenta para esta operación.");
                return;
            }
            formModalTitle.textContent = 'Transferir entre mis Cuentas';
            formTransferir.style.display = 'block';
            modalSubmitBtn.onclick = handleSubmitTransferir;
        } else if (tipo === 'credito') {
            formModalTitle.textContent = 'Solicitar Crédito';
            formCredito.style.display = 'block';
            modalSubmitBtn.onclick = handleSubmitCredito;
        } else if (tipo === 'tarjeta') {
            formModalTitle.textContent = 'Solicitar Tarjeta de Crédito';
            formTarjeta.style.display = 'block';
            modalSubmitBtn.onclick = handleSubmitTarjeta;
        } else if (tipo === 'cdt') {
            if (!poblarSelectCuentas('cdt-cuenta-origen')) {
                alert("Debes tener al menos una cuenta de ahorros para abrir un CDT.");
                return;
            }
            formModalTitle.textContent = 'Abrir Nuevo CDT';
            formCdt.style.display = 'block';
            modalSubmitBtn.onclick = handleSubmitCDT;
        }
        
        formModal.style.display = 'block';
    }
    
    window.abrirModalAvance = (id_tarjeta, cupo_disponible) => {
        const poblarSelectCuentas = (selectId) => {
            const selectEl = document.getElementById(selectId);
            selectEl.innerHTML = '';
            if (misCuentas.length === 0) {
                selectEl.innerHTML = '<option value="">No tienes cuentas</option>';
                return false;
            }
            misCuentas.forEach(cuenta => {
                selectEl.innerHTML += `<option value="${cuenta.id}">
                    ${cuenta.numero_cuenta} (Saldo: $${formatCurrency(cuenta.saldo)})
                </option>`;
            });
            return true;
        };

        if (!poblarSelectCuentas('avance-cuenta-destino')) {
                alert("Necesitas una cuenta de ahorros para recibir el avance.");
                return;
        }
        
        formTransferir.style.display = 'none';
        formCredito.style.display = 'none';
        formTarjeta.style.display = 'none';
        formCdt.style.display = 'none';
        formPagarTarjeta.style.display = 'none';
        
        document.getElementById('avance-info').textContent = `Avance desde Tarjeta ...${misTarjetas.find(t=>t.id===id_tarjeta).numero_tarjeta.slice(-4)}. Cupo Disponible: $${formatCurrency(cupo_disponible)}`;
        formModalTitle.textContent = 'Realizar Avance';
        formAvance.style.display = 'block';
        modalSubmitBtn.onclick = () => handleSubmitAvance(id_tarjeta);
        formModal.style.display = 'block';
    }

    window.abrirModalPagarTarjeta = (id_tarjeta, cupo_usado) => {
        const poblarSelectCuentas = (selectId) => {
            const selectEl = document.getElementById(selectId);
            selectEl.innerHTML = '';
            if (misCuentas.length === 0) {
                selectEl.innerHTML = '<option value="">No tienes cuentas</option>';
                return false;
            }
            misCuentas.forEach(cuenta => {
                selectEl.innerHTML += `<option value="${cuenta.id}">
                    ${cuenta.numero_cuenta} (Saldo: $${formatCurrency(cuenta.saldo)})
                </option>`;
            });
            return true;
        };
        
        if (!poblarSelectCuentas('pagar-tarjeta-cuenta-origen')) {
                alert("Necesitas una cuenta de ahorros para pagar la tarjeta.");
                return;
        }
        
        formTransferir.style.display = 'none';
        formCredito.style.display = 'none';
        formTarjeta.style.display = 'none';
        formCdt.style.display = 'none';
        formAvance.style.display = 'none';

        document.getElementById('pagar-tarjeta-info').textContent = `Pagar Tarjeta ...${misTarjetas.find(t=>t.id===id_tarjeta).numero_tarjeta.slice(-4)}. Deuda Actual: $${formatCurrency(cupo_usado)}`;
        document.getElementById('pagar-tarjeta-monto').placeholder = `Ej: ${cupo_usado}`;
        document.getElementById('pagar-tarjeta-monto').value = "";
        formModalTitle.textContent = 'Pagar Tarjeta de Crédito';
        formPagarTarjeta.style.display = 'block';
        modalSubmitBtn.onclick = () => handleSubmitPagarTarjeta(id_tarjeta);
        formModal.style.display = 'block';
    }

    closeFormBtn.onclick = () => { formModal.style.display = 'none'; }
    closeTransaccionesBtn.onclick = () => { modalTransacciones.style.display = 'none'; }
    window.onclick = (event) => {
        if (event.target == modalAmortizacion) modalAmortizacion.style.display = 'none';
        if (event.target == formModal) formModal.style.display = 'none';
        if (event.target == modalTransacciones) modalTransacciones.style.display = 'none';
    }
    
    // --- 6. Handlers de Submit ---
    window.crearCuentaAhorros = async () => {
        if (!confirm('¿Deseas abrir una nueva cuenta de ahorros con saldo $0?')) return;
        try {
            const response = await fetch('/cliente/crear_cuenta_ahorros', { method: 'POST' });
            const data = await response.json();
            if (response.ok) { alert(data.mensaje); cargarPerfilYProductos(); }
            else { alert(`Error: ${data.error}`); }
        } catch (error) { alert("Error de red al crear la cuenta."); }
    }
    async function handleSubmitTransferir() {
        const id_cuenta_origen = document.getElementById('transfer-cuenta-origen').value;
        const id_cuenta_destino = document.getElementById('transfer-cuenta-destino').value;
        const monto = document.getElementById('transfer-monto').value;
        if (!monto || monto <= 0) {
            modalErrorMsg.textContent = 'El monto debe ser mayor a 0.';
            modalErrorMsg.style.display = 'block';
            return;
        }
        try {
            const response = await fetch('/cliente/transferir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    monto: parseFloat(monto),
                    id_cuenta_origen: parseInt(id_cuenta_origen),
                    id_cuenta_destino: parseInt(id_cuenta_destino)
                })
            });
            const data = await response.json();
            if (response.ok) {
                alert(data.mensaje);
                formModal.style.display = 'none';
                cargarPerfilYProductos();
            } else {
                modalErrorMsg.textContent = `Error: ${data.error}`;
                modalErrorMsg.style.display = 'block';
            }
        } catch (error) {
            modalErrorMsg.textContent = 'Error de red.';
            modalErrorMsg.style.display = 'block';
        }
    }
    async function handleSubmitCredito() {
        const monto = document.getElementById('credito-monto').value;
        const plazo = document.getElementById('credito-plazo').value;
        const tipo = document.getElementById('credito-tipo').value;
        if (monto <= 0 || plazo <= 0) {
            modalErrorMsg.textContent = 'Monto y plazo deben ser mayores a 0.';
            modalErrorMsg.style.display = 'block';
            return;
        }
        try {
            const response = await fetch('/cliente/solicitar_credito', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ monto: parseFloat(monto), plazo: parseInt(plazo), tipo: tipo })
            });
            const data = await response.json();
            if (response.ok) {
                alert(data.mensaje);
                formModal.style.display = 'none';
                cargarPerfilYProductos();
            } else {
                modalErrorMsg.textContent = `Error: ${data.error}`;
                modalErrorMsg.style.display = 'block';
            }
        } catch (error) {
            modalErrorMsg.textContent = 'Error de red.';
            modalErrorMsg.style.display = 'block';
        }
    }
    async function handleSubmitTarjeta() {
        const cupo = document.getElementById('tarjeta-cupo').value;
        if (cupo <= 0) {
            modalErrorMsg.textContent = 'El cupo debe ser mayor a 0.';
            modalErrorMsg.style.display = 'block';
            return;
        }
        try {
            const response = await fetch('/cliente/solicitar_tarjeta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cupo_solicitado: parseFloat(cupo) })
            });
            const data = await response.json();
            if (response.ok) {
                alert(data.mensaje);
                formModal.style.display = 'none';
                cargarPerfilYProductos();
            } else {
                modalErrorMsg.textContent = `Error: ${data.error}`;
                modalErrorMsg.style.display = 'block';
            }
        } catch (error) {
            modalErrorMsg.textContent = 'Error de red.';
            modalErrorMsg.style.display = 'block';
        }
    }
    async function handleSubmitCDT() {
        const monto = document.getElementById('cdt-monto').value;
        const plazo_dias = document.getElementById('cdt-plazo').value;
        const id_cuenta_origen = document.getElementById('cdt-cuenta-origen').value;
        if (monto <= 0 || plazo_dias <= 0) {
            modalErrorMsg.textContent = 'Monto y plazo deben ser mayores a 0.';
            modalErrorMsg.style.display = 'block';
            return;
        }
        try {
            const response = await fetch('/cliente/abrir_cdt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    monto: parseFloat(monto), 
                    plazo_dias: parseInt(plazo_dias),
                    id_cuenta_origen: parseInt(id_cuenta_origen)
                })
            });
            const data = await response.json();
            if (response.ok) {
                alert(data.mensaje);
                formModal.style.display = 'none';
                cargarPerfilYProductos();
            } else {
                modalErrorMsg.textContent = `Error: ${data.error}`;
                modalErrorMsg.style.display = 'block';
            }
        } catch (error) {
            modalErrorMsg.textContent = 'Error de red.';
            modalErrorMsg.style.display = 'block';
        }
    }
    async function handleSubmitAvance(id_tarjeta) {
        const id_cuenta_destino = document.getElementById('avance-cuenta-destino').value;
        const monto = document.getElementById('avance-monto').value;
        if (monto <= 0) {
            modalErrorMsg.textContent = 'El monto debe ser mayor a 0.';
            modalErrorMsg.style.display = 'block';
            return;
        }
        try {
            const response = await fetch('/cliente/realizar_avance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    monto: parseFloat(monto),
                    id_tarjeta: id_tarjeta,
                    id_cuenta_destino: parseInt(id_cuenta_destino)
                })
            });
            const data = await response.json();
            if (response.ok) {
                alert(data.mensaje);
                formModal.style.display = 'none';
                cargarPerfilYProductos();
            } else {
                modalErrorMsg.textContent = `Error: ${data.error}`;
                modalErrorMsg.style.display = 'block';
            }
        } catch (error) {
            modalErrorMsg.textContent = 'Error de red.';
            modalErrorMsg.style.display = 'block';
        }
    }
    async function handleSubmitPagarTarjeta(id_tarjeta) {
        const id_cuenta_origen = document.getElementById('pagar-tarjeta-cuenta-origen').value;
        const monto = document.getElementById('pagar-tarjeta-monto').value;
        if (monto <= 0) {
            modalErrorMsg.textContent = 'El monto debe ser mayor a 0.';
            modalErrorMsg.style.display = 'block';
            return;
        }
        try {
            const response = await fetch('/cliente/pagar_tarjeta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    monto: parseFloat(monto),
                    id_tarjeta: id_tarjeta,
                    id_cuenta_origen: parseInt(id_cuenta_origen)
                })
            });
            const data = await response.json();
            if (response.ok) {
                alert(data.mensaje);
                formModal.style.display = 'none';
                cargarPerfilYProductos();
            } else {
                modalErrorMsg.textContent = `Error: ${data.error}`;
                modalErrorMsg.style.display = 'block';
            }
        } catch (error) {
            modalErrorMsg.textContent = 'Error de red.';
            modalErrorMsg.style.display = 'block';
        }
    }

    // --- 7. Funciones Globales para Botones ---
    window.realizarOperacion = async (tipo, id_cuenta) => {
        const montoEl = document.getElementById(`monto-cuenta-${id_cuenta}`);
        const monto = parseFloat(montoEl.value);
        if (!monto || monto <= 0) { alert("Por favor, ingresa un monto válido."); return; }
        const url = (tipo === 'consignar') ? '/cliente/consignar' : '/cliente/retirar';
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_cuenta: id_cuenta, monto: monto })
            });
            const data = await response.json();
            if (response.ok) {
                alert(data.mensaje);
                cargarPerfilYProductos();
            } else {
                alert(`Error: ${data.error}`);
            }
        } catch (error) { alert("Error de red al realizar la operación."); }
    }
    window.eliminarCuenta = async (id_cuenta) => {
        if (!confirm('¿Estás seguro de que quieres eliminar esta cuenta? El saldo debe ser $0. Esta acción no se puede deshacer.')) return;
        try {
            const response = await fetch('/cliente/eliminar_cuenta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_cuenta: id_cuenta })
            });
            const data = await response.json();
            if (response.ok) { alert(data.mensaje); cargarPerfilYProductos(); }
            else { alert(`Error: ${data.error}`); }
        } catch (error) { alert("Error de red al eliminar la cuenta."); }
    }
    window.realizarCompra = async (id_tarjeta) => {
        const monto = prompt("Monto de la compra (simulación):", "25000");
        if (!monto || monto <= 0) return;
        try {
            const response = await fetch('/cliente/pagar_con_tarjeta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_tarjeta: id_tarjeta, monto: parseFloat(monto) })
            });
            const data = await response.json();
            if (response.ok) { alert(data.mensaje); cargarPerfilYProductos(); }
            else { alert(`Error: ${data.error}`); }
        } catch (error) { alert("Error de red al procesar el pago."); }
    }
    window.realizarPagoCredito = async (id_credito) => {
        const montoEl = document.getElementById(`monto-credito-${id_credito}`);
        const monto = parseFloat(montoEl.value);
        if (!monto || monto <= 0) { alert("Por favor, ingresa un monto válido."); return; }
        if (!confirm(`Se descontará $${formatCurrency(monto)} (más 4x1000 si aplica) de tu cuenta de ahorros principal para abonar al crédito. ¿Continuar?`)) return;
        try {
            const response = await fetch('/cliente/pagar_credito', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_credito: id_credito, monto: monto })
            });
            const data = await response.json();
            if (response.ok) { alert(data.mensaje); cargarPerfilYProductos(); }
            else { alert(`Error: ${data.error}`); }
        } catch (error) { alert("Error de red al procesar el abono."); }
    }
    window.marcarExenta = async (id_cuenta) => {
        if (!confirm('¿Estás seguro? Solo puedes tener UNA cuenta exenta. Todas tus otras cuentas ahora pagarán 4x1000.')) return;
        try {
            const response = await fetch('/cliente/marcar_exenta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_cuenta: id_cuenta })
            });
            const data = await response.json();
            if (response.ok) { alert(data.mensaje); cargarPerfilYProductos(); }
            else { alert(`Error: ${data.error}`); }
        } catch (error) { alert("Error de red."); }
    }

    window.verMovimientos = async (id_cuenta, numero_cuenta) => {
        try {
            const response = await fetch(`/cliente/cuenta/${id_cuenta}/transacciones`);
            if (!response.ok) { const data = await response.json(); alert(`Error: ${data.error}`); return; }
            
            const transacciones = await response.json();
            
            transaccionesTitle.textContent = `Últimos Movimientos (Cuenta ${numero_cuenta})`;
            transaccionLista.innerHTML = '';
            
            if (transacciones.length === 0) {
                transaccionLista.innerHTML = '<li>No hay movimientos en esta cuenta.</li>';
            }
            
            // LIFO: El servidor ya las envía en orden descendente.
            transacciones.forEach(t => {
                // La API envía "Retiro", "Pago", "Consignación"
                const esDebito = (t.tipo === 'Retiro' || t.tipo === 'Pago');
                
                const tipoClase = esDebito ? 'RETIRO' : 'CONSIGNACION';
                const signo = esDebito ? '-' : '+';
                
                transaccionLista.innerHTML += `
                    <li>
                        <div>
                            <strong>${t.tipo}</strong>
                            <div class="transaccion-fecha">${t.fecha}</div>
                        </div>
                        <span class="transaccion-monto ${tipoClase}">
                            ${signo}$${formatCurrency(t.monto)}
                        </span>
                    </li>
                `;
            });
            
            modalTransacciones.style.display = 'block';

        } catch (error) {
            alert("Error de red al cargar movimientos.");
        }
    }
    
    // --- 8. Helper de Formato y Carga Inicial ---
    function formatCurrency(value) {
        if (typeof value !== 'number') value = parseFloat(value) || 0;
        return new Intl.NumberFormat('es-CO', { 
            minimumFractionDigits: 0, 
            maximumFractionDigits: 0 
        }).format(value);
    }
    cargarPerfilYProductos(); // Carga inicial
});