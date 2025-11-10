// static/js/filas.js
document.addEventListener('DOMContentLoaded', () => {

    const formTomarTurno = document.getElementById('form-tomar-turno');
    const miTurnoDisplay = document.getElementById('mi-turno');
    const numeroMiTurno = document.getElementById('numero-mi-turno');
    
    // --- Selectores del nuevo Login Modal ---
    const checkAfiliado = document.getElementById('es_afiliado');
    const afiliadoLoginForm = document.getElementById('afiliado-login-form');
    const afiliadoLoginError = document.getElementById('afiliado-login-error');

    // --- 1. Lógica para mostrar/ocultar el login modal ---
    checkAfiliado.addEventListener('change', () => {
        if (checkAfiliado.checked) {
            afiliadoLoginForm.style.display = 'block';
        } else {
            afiliadoLoginForm.style.display = 'none';
            afiliadoLoginError.style.display = 'none'; // Ocultar errores
        }
    });

    // --- 2. Lógica para TOMAR TURNO (Actualizada) ---
    formTomarTurno.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Datos básicos del turno
        let nombre = document.getElementById('nombre').value;
        const es_preferencial = document.getElementById('es_preferencial').checked;
        let es_afiliado = checkAfiliado.checked;
        let id_cliente = null;
        
        afiliadoLoginError.style.display = 'none'; // Ocultar error

        // --- VALIDACIÓN DE AFILIADO ---
        if (es_afiliado) {
            const email = document.getElementById('afiliado_email').value;
            const password = document.getElementById('afiliado_pass').value;

            if (!email || !password) {
                afiliadoLoginError.textContent = 'Email y contraseña son requeridos.';
                afiliadoLoginError.style.display = 'block';
                return; // Detener envío
            }

            try {
                // Llamar a la nueva API de validación
                const validationResponse = await fetch('/filas/validar_afiliado', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email, password: password })
                });

                const validationData = await validationResponse.json();

                if (!validationResponse.ok || !validationData.validado) {
                    afiliadoLoginError.textContent = validationData.error || 'Credenciales inválidas o no eres afiliado.';
                    afiliadoLoginError.style.display = 'block';
                    return; // Detener envío
                }
                
                // ¡Validación exitosa!
                // Usamos los datos del cliente validado
                id_cliente = validationData.id_cliente;
                nombre = validationData.nombre; // Sobrescribir el nombre con el real

            } catch (error) {
                afiliadoLoginError.textContent = 'Error de red al validar.';
                afiliadoLoginError.style.display = 'block';
                return;
            }
        }
        // --- FIN VALIDACIÓN ---

        // Si se pasa la validación (o no era necesaria), pedir el turno
        try {
            const response = await fetch('/filas/tomar_turno', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    nombre: nombre, 
                    es_afiliado: es_afiliado, // Será 'true' solo si pasó la validación
                    es_preferencial: es_preferencial,
                    id_cliente: id_cliente // Será el ID del cliente validado
                })
            });

            if (response.ok) {
                const data = await response.json();
                numeroMiTurno.textContent = data.turno.numero_turno;
                miTurnoDisplay.style.display = 'block';
                formTomarTurno.reset();
                afiliadoLoginForm.style.display = 'none'; // Ocultar modal de login
            } else {
                alert("Error al tomar el turno. Intenta de nuevo.");
            }
        } catch (error) {
            alert("Error de red al tomar el turno.");
        }
    });

    // 3. Lógica para ACTUALIZAR PANTALLA
    const turnoActualDisplay = document.getElementById('turno-actual-display');
    const listaPreferencial = document.getElementById('lista-preferencial');
    const listaAfiliado = document.getElementById('lista-afiliado');
    const listaNoAfiliado = document.getElementById('lista-no_afiliado');

    async function actualizarPantallaTurnos() {
        try {
            const response = await fetch('/filas/estado_actual');
            const data = await response.json();

            if (data.turno_en_caja) {
                turnoActualDisplay.textContent = data.turno_en_caja.numero_turno;
            } else {
                turnoActualDisplay.textContent = '---';
            }

            const actualizarLista = (element, lista) => {
                element.innerHTML = '';
                if (lista.length === 0) {
                    element.innerHTML = '<li>---</li>';
                    return;
                }
                lista.forEach(turno => {
                    const li = document.createElement('li');
                    li.textContent = turno;
                    element.appendChild(li);
                });
            };

            actualizarLista(listaPreferencial, data.fila_preferencial);
            actualizarLista(listaAfiliado, data.fila_afiliado);
            actualizarLista(listaNoAfiliado, data.fila_no_afiliado);

        } catch (error) {
            console.error("Error actualizando la pantalla de turnos:", error);
        }
    }

    setInterval(actualizarPantallaTurnos, 3000);
    actualizarPantallaTurnos();
});