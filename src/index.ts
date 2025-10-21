import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { prisma } from './db';

const app = express();
app.use(cors());
app.use(express.json());

// Ping
app.get('/', (_req, res) => {
  res.json({ ok: true, message: 'API Inventario Pinturas — Hola Jonathan 👋' });
});

// Listar productos (con estado calculado)
app.get('/products', async (req, res) => {
  const { status } = req.query; // 'ok' | 'por-vencer' | 'vencido'
  const all = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } });

  const withComputed = all.map(p => {
    const daysLeft = Math.ceil((p.expiryDate.getTime() - Date.now()) / (1000*60*60*24));
    let s: 'OK' | 'POR_VENCER' | 'VENCIDO' = 'OK';
    if (daysLeft < 0) s = 'VENCIDO';
    else if (daysLeft <= 10) s = 'POR_VENCER';
    return { ...p, daysLeft, status: s };
  });

  let result = withComputed;
  if (status === 'ok') result = withComputed.filter(x => x.status === 'OK');
  if (status === 'por-vencer') result = withComputed.filter(x => x.status === 'POR_VENCER');
  if (status === 'vencido') result = withComputed.filter(x => x.status === 'VENCIDO');

  res.json(result);
});

// Crear producto (bloquea duplicados por code+batch)
app.post('/products', async (req, res) => {
  try {
    const {
      code, batch, name, brand, category, subtype, presentation,
      color, expiryDate, entryDate, location, quantity, unitPrice,
      currency = 'USD', comment = ''
    } = req.body;

    // Validaciones mínimas
    if (!code || !name || !brand || !category || !presentation || !expiryDate || quantity == null || unitPrice == null) {
      return res.status(400).json({ ok: false, message: 'Faltan campos obligatorios.' });
    }

    const created = await prisma.product.create({
      data: {
        code, batch, name, brand, category, subtype, presentation, color,
        expiryDate: new Date(expiryDate),
        entryDate: entryDate ? new Date(entryDate) : undefined,
        location,
        quantity: Number(quantity),
        unitPrice: String(unitPrice), // Decimal en Prisma
        currency,
        comment
      }
    });

    res.status(201).json({ ok: true, product: created });
  } catch (err: any) {
    // Prisma duplicate key
    if (err.code === 'P2002') {
      return res.status(409).json({ ok: false, message: 'Producto duplicado (code+batch ya existe).' });
    }
    console.error(err);
    res.status(500).json({ ok: false, message: 'Error creando producto.' });
  }
});

// =================== ACTUALIZAR PRODUCTO ===================
app.put('/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const data: any = { ...req.body };

    if (data.expiryDate) data.expiryDate = new Date(data.expiryDate);
    if (data.entryDate) data.entryDate = new Date(data.entryDate);
    if (data.quantity != null) data.quantity = Number(data.quantity);
    if (data.unitPrice != null) data.unitPrice = String(data.unitPrice);

    const updated = await prisma.product.update({
      where: { id },
      data,
    });

    res.json({ ok: true, product: updated });
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ ok: false, message: 'Conflicto: code+batch ya existe.' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ ok: false, message: 'Producto no encontrado.' });
    }
    console.error(err);
    res.status(500).json({ ok: false, message: 'Error actualizando producto.' });
  }
});

// =================== ELIMINAR PRODUCTO ===================
app.delete('/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.product.delete({ where: { id } });
    res.json({ ok: true, message: 'Producto eliminado correctamente.' });
  } catch (err: any) {
    if (err.code === 'P2025') {
      return res.status(404).json({ ok: false, message: 'Producto no encontrado.' });
    }
    console.error(err);
    res.status(500).json({ ok: false, message: 'Error eliminando producto.' });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
