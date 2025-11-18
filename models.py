from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, Float, Boolean, Date, Enum as SQLAlchemyEnum, ForeignKey, DateTime
from typing import List
import enum
import datetime

class Base(DeclarativeBase):
    pass

db = SQLAlchemy(model_class=Base)

class TipoCliente(str, enum.Enum):
    NO_AFILIADO = "No Afiliado"
    AFILIADO = "Afiliado"

class TipoCredito(str, enum.Enum):
    LIBRE_INVERSION = "Libre Inversión"
    CARTERA = "Cartera"

class TipoTransaccion(str, enum.Enum):
    RETIRO = "Retiro"
    CONSIGNACION = "Consignación"
    PAGO = "Pago"

class Cajero(db.Model):
    __tablename__ = 'cajero'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    nombre: Mapped[str] = mapped_column(String(100))

class Cliente(db.Model):
    __tablename__ = 'cliente'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre_completo: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    fecha_nacimiento: Mapped[datetime.date] = mapped_column(Date)
    tiene_discapacidad: Mapped[bool] = mapped_column(Boolean, default=False)
    tipo_cliente: Mapped[TipoCliente] = mapped_column(SQLAlchemyEnum(TipoCliente), default=TipoCliente.NO_AFILIADO)

    cuentas_ahorros: Mapped[List["CuentaAhorros"]] = relationship(back_populates="cliente")
    tarjetas_credito: Mapped[List["TarjetaCredito"]] = relationship(back_populates="cliente")
    creditos: Mapped[List["Credito"]] = relationship(back_populates="cliente")
    cdts: Mapped[List["CDT"]] = relationship(back_populates="cliente")

class CuentaAhorros(db.Model):
    __tablename__ = 'cuentaahorros'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    numero_cuenta: Mapped[str] = mapped_column(String(50), unique=True)
    saldo: Mapped[float] = mapped_column(Float, default=0.0)
    exenta_4x1000: Mapped[bool] = mapped_column(Boolean, default=False)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id"))
    cliente: Mapped[Cliente] = relationship(back_populates="cuentas_ahorros")
    transacciones: Mapped[List["Transaccion"]] = relationship(back_populates="cuenta")

class TarjetaCredito(db.Model):
    __tablename__ = 'tarjetacredito'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    numero_tarjeta: Mapped[str] = mapped_column(String(16), unique=True)
    cupo_total: Mapped[float] = mapped_column(Float)
    cupo_usado: Mapped[float] = mapped_column(Float, default=0.0)
    tasa_interes_mensual: Mapped[float] = mapped_column(Float)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id"))
    cliente: Mapped[Cliente] = relationship(back_populates="tarjetas_credito")

class Credito(db.Model):
    __tablename__ = 'credito'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tipo_credito: Mapped[TipoCredito] = mapped_column(SQLAlchemyEnum(TipoCredito))
    monto_aprobado: Mapped[float] = mapped_column(Float)
    saldo_pendiente: Mapped[float] = mapped_column(Float)
    tasa_interes_anual: Mapped[float] = mapped_column(Float)
    plazo_meses: Mapped[int] = mapped_column(Integer)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id"))
    cliente: Mapped[Cliente] = relationship(back_populates="creditos")

class CDT(db.Model):
    __tablename__ = 'cdt'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    monto_inversion: Mapped[float] = mapped_column(Float)
    plazo_dias: Mapped[int] = mapped_column(Integer)
    tasa_interes_anual: Mapped[float] = mapped_column(Float)
    fecha_creacion: Mapped[datetime.date] = mapped_column(Date)
    fecha_vencimiento: Mapped[datetime.date] = mapped_column(Date)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id"))
    cliente: Mapped[Cliente] = relationship(back_populates="cdts")

class Transaccion(db.Model):
    __tablename__ = 'transaccion'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tipo: Mapped[TipoTransaccion] = mapped_column(SQLAlchemyEnum(TipoTransaccion))
    monto: Mapped[float] = mapped_column(Float)
    fecha: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    cuenta_id: Mapped[int] = mapped_column(ForeignKey("cuentaahorros.id"))
    cuenta: Mapped["CuentaAhorros"] = relationship(back_populates="transacciones")