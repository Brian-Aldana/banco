document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const data = {
            nombre_completo: document.getElementById('nombre_completo').value,
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
            fecha_nacimiento: document.getElementById('fecha_nacimiento').value,
            tiene_discapacidad: document.getElementById('tiene_discapacidad').checked
        };

        try {
            const res = await fetch('/cliente/registrar', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(data)
            });
            
            const r = await res.json();
            const msg = document.getElementById('message');
            
            msg.textContent = r.mensaje || r.error;
            msg.style.color = res.ok ? 'green' : 'red';
            
            // Si el registro es exitoso, redirige al dashboard del cliente
            if (res.ok) {
                setTimeout(() => window.location.href = '/dashboard_cliente', 1500);
            }
            
        } catch (e) { 
            console.error(e);
            const msg = document.getElementById('message');
            msg.textContent = "Error de conexión.";
            msg.style.color = 'red';
        }
    });
});