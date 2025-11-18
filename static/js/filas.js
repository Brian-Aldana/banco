document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form-tomar-turno');
    const checkAfil = document.getElementById('es_afiliado');
    const divLogin = document.getElementById('afiliado-login-form');
    
    checkAfil.addEventListener('change', () => {
        divLogin.style.display = checkAfil.checked ? 'block' : 'none';
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        let id_cliente = null;
        let nombre = document.getElementById('nombre').value;

        if (checkAfil.checked) {
            const email = document.getElementById('afiliado_email').value;
            const pass = document.getElementById('afiliado_pass').value;
            
            if (!email || !pass) return alert("Ingrese credenciales");

            try {
                const resVal = await fetch('/filas/validar_afiliado', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email, password:pass})});
                const dVal = await resVal.json();
                if (!dVal.validado) {
                    document.getElementById('afiliado-login-error').textContent = dVal.error;
                    document.getElementById('afiliado-login-error').style.display = 'block';
                    return;
                }
                id_cliente = dVal.id_cliente;
                nombre = dVal.nombre;
            } catch(e) { alert("Error validando"); return; }
        }

        try {
            const res = await fetch('/filas/tomar_turno', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
                nombre, es_afiliado: checkAfil.checked, es_preferencial: document.getElementById('es_preferencial').checked, id_cliente
            })});
            if (res.ok) {
                const d = await res.json();
                document.getElementById('numero-mi-turno').textContent = d.turno.numero_turno;
                document.getElementById('mi-turno').style.display = 'block';
                form.reset(); divLogin.style.display = 'none';
            }
        } catch(e) {}
    });

    async function update() {
        try {
            const d = await (await fetch('/filas/estado_actual')).json();
            if(d.turno_en_caja) document.getElementById('turno-actual-display').textContent = d.turno_en_caja.numero_turno;
            const lista = (ul, data) => { ul.innerHTML = ''; data.forEach(t => ul.innerHTML += `<li>${t}</li>`); };
            lista(document.getElementById('lista-preferencial'), d.fila_preferencial);
            lista(document.getElementById('lista-afiliado'), d.fila_afiliado);
            lista(document.getElementById('lista-no_afiliado'), d.fila_no_afiliado);
        } catch(e){}
    }
    setInterval(update, 3000); update();
});