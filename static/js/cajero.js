// static/js/cajero.js
document.addEventListener('DOMContentLoaded', () => {

    // --- Selectores de Turnos (Columna 1) ---
    const btnLlamarSiguiente = document.getElementById('btn-llamar-siguiente');
    const turnoActualDisplay = document.getElementById('turno-actual-display');
    const turnoActualNombre = document.getElementById('turno-actual-nombre');
    const listaPreferencial = document.getElementById('lista-preferencial');
    const listaAfiliado = document.getElementById('lista-afiliado');
    const listaNoAfiliado = document.getElementById('lista-no_afiliado');
    const historialLifo = document.getElementById('historial-lifo');
    const logoutButton = document.getElementById('logout-button'); // <-- Selector del botón de logout

    // --- Selectores de Cliente (Columna 2) ---
    const formBuscarCliente = document.getElementById('form-buscar-cliente');
    const searchTermInput = document.getElementById('search_term');
    const clienteInfo = document.getElementById('cliente-info');
    const clienteNombre = document.getElementById('cliente-nombre');
    const clienteEmail = document.getElementById('cliente-email');
    const clienteTipo = document.getElementById('cliente-tipo');
    const cuentasContainer = document.getElementById('cuentas-container');
    const creditosContainer = document.getElementById('creditos-container');
    
    // --- Selectores de Registro (Columna 2) ---
    const btnAfiliarCliente = document.getElementById('btn-afiliar-cliente');
    const cardRegistrar = document.getElementById('card-registrar');
    const formAfiliarCliente = document.getElementById('form-afiliar-cliente');

    // --- Selectores de Modal (Amortización) ---
    const modal = document.getElementById('modal-amortizacion');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cuotaFijaDisplay = document.getElementById('cuota-fija-display');
    const tablaAmortizacionBody = document.getElementById('tabla-amortizacion-body');

    let CLIENTE_ACTUAL_ID = null;

    // ===============================================
    // LÓGICA DE TURNOS (FIFO PONDERADO)
    // ===============================================

    btnLlamarSiguiente.addEventListener('click', async () => {
        try {
            const response = await fetch('/filas/llamar_siguiente');
            const data = await response.json();

            if (response.ok) {
                const turno = data.turno_llamado;
                turnoActualDisplay.textContent = turno.numero_turno;
                turnoActualNombre.textContent = turno.nombre;
                
                if (turno.id_cliente) {
                    cargarCliente(turno.id_cliente);
                    searchTermInput.value = turno.id_cliente;
                } else if (turno.tipo === 'no_afiliado') {
                    limpiarCliente();
                    cardRegistrar.style.display = 'block';
                    document.getElementById('reg-nombre').value = turno.nombre;
                } else {
                    limpiarCliente();
                }

            } else {
                // Si la sesión expiró (401) o no hay nadie (404)
                if (response.status === 401) {
                    alert("Tu sesión de cajero expiró. Serás redirigido al login.");
                    window.location.href = '/cajero/login';
                } else {
                    turnoActualDisplay.textContent = '---';
                    turnoActualNombre.textContent = '(No hay nadie)';
                    alert(data.mensaje);
                }
            }
            
            actualizarPantallaTurnos();
            cargarHistorialLifo();

        } catch (error) {
            console.error("Error llamando turno:", error);
        }
    });

    async function actualizarPantallaTurnos() {
        // ... (código existente sin cambios) ...
        try {
            const response = await fetch('/filas/estado_actual');
            const data = await response.json();

            if (data.turno_en_caja && turnoActualDisplay.textContent === '---') {
                turnoActualDisplay.textContent = data.turno_en_caja.numero_turno;
                turnoActualNombre.textContent = data.turno_en_caja.nombre;
            }

            const actualizarLista = (element, lista, nombre) => {
                element.innerHTML = `<strong>${nombre}:</strong>`;
                if (lista.length === 0) {
                    element.innerHTML += ' <li>---</li>';
                    return;
                }
                lista.forEach(turno => {
                    const li = document.createElement('li');
                    li.textContent = turno;
                    element.appendChild(li);
                });
            };

            actualizarLista(listaPreferencial, data.fila_preferencial, 'Preferencial (20%)');
            actualizarLista(listaAfiliado, data.fila_afiliado, 'Afiliado (60%)');
            actualizarLista(listaNoAfiliado, data.fila_no_afiliado, 'No Afiliado (20%)');

        } catch (error) {
            console.error("Error actualizando la pantalla de turnos:", error);
        }
    }

    // ===============================================
    // LÓGICA DEL CAJERO (POO y Operaciones)
    // ===============================================

    formBuscarCliente.addEventListener('submit', async (e) => {
        e.preventDefault();
        const termino = searchTermInput.value;
        if (!termino) return;
        
        cargarCliente(termino);
    });

    async function cargarCliente(termino_busqueda) {
        // ... (código existente sin cambios) ...
        try {
            const response = await fetch('/cajero/buscar_cliente', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ search_term: termino_busqueda })
            });

            if (!response.ok) {
                if (response.status === 401) {
                    alert("Tu sesión de cajero expiró. Serás redirigido al login.");
                    window.location.href = '/cajero/login';
                } else {
                    alert(data.error || "Error buscando cliente");
                }
                limpiarCliente();
                return;
            }

            const cliente = await response.json();
            
            CLIENTE_ACTUAL_ID = cliente.id;
            clienteInfo.style.display = 'block';
            cardRegistrar.style.display = 'none';
            
            clienteNombre.textContent = cliente.nombre_completo;
            clienteEmail.textContent = cliente.email;
            clienteTipo.textContent = cliente.tipo_cliente;
            
            cuentasContainer.innerHTML = '<h3>Cuentas de Ahorro</h3>';
            if(cliente.cuentas_ahorros.length === 0) {
                cuentasContainer.innerHTML += '<p>No tiene cuentas.</p>';
            }
            cliente.cuentas_ahorros.forEach(cuenta => {
                cuentasContainer.innerHTML += `
                    <div classclass="card producto-card">
                        <h4>Cuenta N°: ${cuenta.numero_cuenta}</h4>
                        <p>Saldo: <strong>$${formatCurrency(cuenta.saldo)}</strong></p>
                        ${cuenta.exenta_4x1000 ? '<span style="color:green; font-size:0.8rem;">Exenta 4x1000</span>' : ''}
                        
                        <div class="operacion-item">
                            <input type="number" id="monto-${cuenta.id}" class="form-control" placeholder="Monto">
                            <button class="btn btn-verde" onclick="realizarOperacion('consignar', ${cuenta.id})">Consignar</button>
                            <button class="btn btn-rojo" onclick="realizarOperacion('retirar', ${cuenta.id})">Retirar</button>
                        </div>
                        <button class="btn btn-cancelar" onclick="cancelarCuenta(${cuenta.id})" style="margin-top: 10px; width: 100%;">Cancelar Cuenta</button>
                    </div>
                `;
            });

            creditosContainer.innerHTML = '<h3>Créditos y CDTs</h3>';
            if(cliente.creditos.length === 0 && cliente.cdts.length === 0) {
                creditosContainer.innerHTML += '<p>No tiene productos.</p>';
            }
            cliente.creditos.forEach(credito => {
                creditosContainer.innerHTML += `
                    <div class="card producto-card">
                        <h4>Crédito: ${credito.tipo_credito}</h4>
                        <p>Saldo Pendiente: <strong>$${formatCurrency(credito.saldo_pendiente)}</strong></p>
                        <p>Aprobado: $${formatCurrency(credito.monto_aprobado)}</p>
                        <button class="btn btn-secondary" onclick="abrirModalAmortizacion(${credito.id})">Ver Amortización</button>
                    </div>
                `;
            });
            cliente.cdts.forEach(cdt => {
                creditosContainer.innerHTML += `
                    <div class="card producto-card">
                        <h4>CDT (ID: ${cdt.id})</h4>
                        <p>Inversión: <strong>$${formatCurrency(cdt.monto_inversion)}</strong></p>
                        <p>Plazo: ${cdt.plazo_dias} días</p>
                    </div>
                `;
            });
            
            cargarHistorialLifo();

        } catch (error) {
            console.error("Error cargando cliente:", error);
            alert("Error de red al buscar cliente.");
        }
    }

    function limpiarCliente() {
        // ... (código existente sin cambios) ...
        CLIENTE_ACTUAL_ID = null;
        clienteInfo.style.display = 'none';
        cardRegistrar.style.display = 'none';
        searchTermInput.value = '';
    }

    // --- Lógica de Operaciones (Consignar / Retirar) ---
    window.realizarOperacion = async (tipo, id_cuenta) => {
        // ... (código existente sin cambios) ...
        const monto = document.getElementById(`monto-${id_cuenta}`).value;
        if (!monto || monto <= 0) {
            alert("Debe ingresar un monto válido.");
            return;
        }
        const url = (tipo === 'consignar') ? '/cajero/realizar_consignacion' : '/cajero/realizar_retiro';
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_cuenta: id_cuenta, monto: parseFloat(monto) })
            });
            const data = await response.json();
            if (response.ok) {
                alert(data.mensaje);
                cargarCliente(data.cliente_id);
            } else {
                if(response.status === 401) window.location.href = '/cajero/login';
                alert(`Error: ${data.error}`);
            }
        } catch (error) {
            alert("Error de red al realizar la operación.");
        }
    }

    // --- Lógica de Cancelar Cuenta ---
    window.cancelarCuenta = async (id_cuenta) => {
        // ... (código existente sin cambios) ...
        if (!confirm(`¿Está seguro que desea CANCELAR la cuenta N° ${id_cuenta}? Esta acción no se puede deshacer.`)) {
            return;
        }
        try {
            const response = await fetch('/cajero/cancelar_cuenta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_cuenta: id_cuenta })
            });
            const data = await response.json();
            if (response.ok) {
                alert(data.mensaje);
                cargarCliente(data.cliente_id);
            } else {
                if(response.status === 401) window.location.href = '/cajero/login';
                alert(`Error: ${data.error}`);
            }
        } catch (error) {
            alert("Error de red al cancelar la cuenta.");
        }
    }

    // --- Lógica de Afiliar Cliente (Registro en ventanilla) ---
    btnAfiliarCliente.addEventListener('click', () => {
        // ... (código existente sin cambios) ...
        limpiarCliente();
        cardRegistrar.style.display = 'block';
    });
    
    formAfiliarCliente.addEventListener('submit', async (e) => {
        // ... (código existente sin cambios) ...
        e.preventDefault();
        const data = {
            nombre_completo: document.getElementById('reg-nombre').value,
            email: document.getElementById('reg-email').value,
            fecha_nacimiento: document.getElementById('reg-fecha').value
        };
        try {
            const response = await fetch('/cajero/afiliar_cliente', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (response.ok) {
                alert(result.mensaje);
                cardRegistrar.style.display = 'none';
                formAfiliarCliente.reset();
                cargarCliente(result.id_cliente);
            } else {
                if(response.status === 401) window.location.href = '/cajero/login';
                alert(`Error: ${result.error}`);
            }
        } catch (error) {
            alert("Error de red al afiliar cliente.");
        }
    });


    // ===============================================
    // LÓGICA DE HISTORIAL (LIFO)
    // ===============================================

    async function cargarHistorialLifo() {
        // ... (código existente sin cambios) ...
        const response = await fetch('/cajero/historial/ver');
        if (!response.ok) return; // Falla silenciosamente si la sesión expira
        const data = await response.json();
        historialLifo.innerHTML = '';
        data.historial.forEach(accion => {
            const li = document.createElement('li');
            li.textContent = accion;
            historialLifo.appendChild(li);
        });
    }

    // ===============================================
    // LÓGICA DE MODAL (Amortización)
    // ===============================================

    window.abrirModalAmortizacion = async (id_credito) => {
        // ... (código existente sin cambios) ...
        const response = await fetch(`/credito/${id_credito}/amortizacion`);
        const data = await response.json();
        cuotaFijaDisplay.textContent = `Cuota Fija Mensual: $${formatCurrency(data.cuota_fija_mensual)}`;
        tablaAmortizacionBody.innerHTML = '';
        data.tabla_amortizacion.forEach(fila => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${fila.mes}</td>
                <td>$${formatCurrency(fila.cuota)}</td>
                <td>$${formatCurrency(fila.interes)}</td>
                <td>$${formatCurrency(fila.capital)}</td>
                <td>$${formatCurrency(fila.saldo_restante)}</td>
            `;
            tablaAmortizacionBody.appendChild(tr);
        });
        modal.style.display = 'block';
    }

    closeModalBtn.onclick = () => { modal.style.display = 'none'; }
    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    }

    // ===============================================
    // HELPERS Y CARGA INICIAL
    // ===============================================
    
    // --- ¡LOGOUT ACTUALIZADO! ---
    logoutButton.addEventListener('click', async (e) => {
        e.preventDefault();
        
        await fetch('/cajero/logout', { method: 'POST' });
        
        alert("Sesión de cajero cerrada.");
        window.location.href = '/'; // Redirigir al menú principal
    });

    function formatCurrency(value) {
        // ... (código existente sin cambios) ...
        if (typeof value !== 'number') {
            value = parseFloat(value) || 0;
        }
        return new Intl.NumberFormat('es-CO', { 
            minimumFractionDigits: 0, 
            maximumFractionDigits: 0 
        }).format(value);
    }

    // --- Carga Inicial ---
    actualizarPantallaTurnos();
    cargarHistorialLifo();
    setInterval(actualizarPantallaTurnos, 5000);
});