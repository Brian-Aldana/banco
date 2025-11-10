# 🏦 Proyecto: Banco Ucundinamarca

Este es un proyecto de simulación bancaria hecho en Flask para la universidad.

El objetivo principal es simular la interfaz de un **Cajero** de banco, cumpliendo con los requisitos del proyecto: POO, estructuras LIFO/FIFO, y lógica de negocio bancaria.

## Stack

* **Backend:** Flask (Python)
* **Frontend:** JavaScript (Vanilla), HTML, CSS
* **Base de Datos:** SQLAlchemy con SQLite (manejado por Flask-Migrate)

## Features

* **Roles Separados:** El sistema tiene un login para **Clientes** y un login separado (y protegido) para **Cajeros**.
* **Menú Principal:** Una pantalla de inicio (`/`) para elegir a qué parte del sistema entrar.
* **Sistema de Turnos (FIFO):** Usa `collections.deque` para las colas de espera.
* **Lógica de Turnos Ponderada:** El cajero no llama en orden; llama según una probabilidad (25% Preferencial, 60% Afiliado, 15% No Afiliado).
* **Panel de Cajero (`/cajero`):**
    * Protegido por login (usuario `cajero@banco.com`).
    * Puede buscar clientes (por ID o email).
    * Puede realizar **Retiros** y **Consignaciones**.
    * Puede **Cancelar Cuentas**.
    * Puede **Afiliar** nuevos clientes que están en la fila.
    * Puede ver tablas de **amortización** de créditos.
* **Historial (LIFO):** El panel del cajero muestra un historial de sus acciones, implementado como una pila (stack) en la sesión.
* **Seed Command:** Un comando para crear usuarios de prueba al instante.

## Estructura
/BANCO/
├── instance/         <-- Base de datos
│   └── banco_ucundinamarca.db
├── migrations/         <-- Archivos de migración de la BD
├── static/             <-- CSS y JavaScript
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── cajero.js
│       ├── cajero_login.js
│       ├── filas.js
│       ├── login.js
│       └── register.js
├── templates/          <-- Archivos HTML
│   ├── cajero.html
│   ├── cajero_login.html
│   ├── filas.html
│   ├── index.html
│   ├── login.html
│   └── register.html
├── venv/
├── app.py              <-- El servidor Flask (rutas, API)
├── models.py           <-- Las clases de la BD (POO)
├── utils.py            <-- Decoradores y lógica (Amortización)
└── requirements.txt    <-- Librerias necesarias

## 🚀 Cómo Correrlo (Guía Rápida)

1.  **Activa el entorno virtual**
    (Asumiendo que estás en PowerShell)
    ```powershell
    .\venv\Scripts\Activate.ps1
    ```

2.  **Instala las dependencias** (si no lo has hecho)
    ```powershell
    pip install -r requirements.txt
    ```

3.  **Configura Flask** (en cada terminal nueva)
    ```powershell
    $env:FLASK_APP = "app.py"
    ```

4.  **Crea la Base de Datos (¡Importante!)**
    Estos comandos leen `models.py` y construyen el archivo `.db`.
    *Si cambiaste `models.py` (como ahora, que añadimos `Cajero`), tienes que hacer esto.*
    
    ```powershell
    # 1. Crea el script de migración
    flask db migrate -m "Agregar tabla Cajero y roles"
    
    # 2. Aplica los cambios a la BD
    flask db upgrade
    ```
    *Nota: Si esto da error, a veces es más fácil borrar el `.db` y la carpeta `migrations` y correr `init`, `migrate`, `upgrade` desde cero.*

5.  **Crea los usuarios de prueba (Seed)**
    Este comando ejecuta la función `seed-db` que está en `app.py`.
    ```powershell
    flask seed-db
    ```
    Esto creará los siguientes usuarios de prueba:
    * **Rol Cajero:**
        * **Email:** `cajero@banco.com`
        * **Pass:** `cajero123`
    * **Rol Cliente (Afiliado):**
        * **Email:** `cliente@test.com`
        * **Pass:** `cliente123`
    * **Rol Cliente (No Afiliado):**
        * **Email:** `cliente_no@test.com`
        * **Pass:** `cliente456`

6.  **¡Corre la app!**
    ```powershell
    flask run
    ```

7.  **Abre el navegador:**
    * `http://127.0.0.1:5000/`