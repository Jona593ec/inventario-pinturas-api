import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Prisma, PrismaClient } from '@prisma/client'; // 👈 Prisma para Decimal

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);

// ---------- Helpers ----------
function computeStatus(expiryDate: Date) {
  const today = new Date();
  const ms = new Date(expiryDate).getTime() - today.getTime();
  const daysLeft = Math.ceil(ms / (1000 * 60 * 60 * 24));
  let status: 'OK' | 'POR_VENCER' | 'VENCIDO' = 'OK';
  if (daysLeft <= 0) status = 'VENCIDO';
  else if (daysLeft <= 10) status = 'POR_VENCER';
  return { daysLeft, status };
}

// normalizadores a prueba de coma y strings
function toInt(v: any) {
  const n = parseInt(String(v ?? '').replace(',', '.').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}
function toDecimal(v: any) {
  const s = String(v ?? '').replace(',', '.').trim();
  if (!s || isNaN(Number(s))) return new Prisma.Decimal(0);
  return new Prisma.Decimal(s); // 👈 recomendado para Numeric
}
function toDate(v: any) {
  // acepta '2026-05-15', Date, o timestamp
  const d = new Date(v);
  if (isNaN(d.getTime())) throw new Error('Fecha inválida');
  return d;
}

// ---------- Root ----------
app.get('/', (_req, res) => {
  res.json({ ok: true, message: 'API Inventario Pinturas — Hola Jonathan 👋' });
});

// ---------- Listado (con filtro ?status=ok|por-vencer|vencido) ----------
app.get('/products', async (_req, res) => {
  const all = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
  const mapped = all.map(p => {
    const { daysLeft, status } = computeStatus(p.expiryDate);
    return { ...p, daysLeft, status };
  });

  const statusQuery = String(_req.query.status || '').toLowerCase();
  let filtered = mapped;
  if (statusQuery === 'ok') filtered = mapped.filter(p => p.status === 'OK');
  if (statusQuery === 'por-vencer') filtered = mapped.filter(p => p.status === 'POR_VENCER');
  if (statusQuery === 'vencido') filtered = mapped.filter(p => p.status === 'VENCIDO');

  res.json(filtered);
});

// ---------- Obtener 1 por id ----------
app.get('/products/:id', async (req, res) => {
  const { id } = req.params;
  const item = await prisma.product.findUnique({ where: { id } });
  if (!item) return res.status(404).json({ ok: false, message: 'No encontrado' });
  res.json(item);
});

// ---------- Crear ----------
app.post('/products', async (req, res) => {
  try {
    const data = req.body;

    // Validar duplicado code+batch
    const exists = await prisma.product.findFirst({
      where: { code: data.code, batch: data.batch ?? null },
    });
    if (exists) return res.status(409).json({ ok: false, message: 'Duplicado code+batch' });

    const created = await prisma.product.create({
      data: {
        code: data.code,
        batch: (data.batch ?? '').toString().trim() || null,
        name: data.name,
        brand: data.brand,
        category: data.category,
        subtype: (data.subtype ?? '').toString().trim() || null,
        presentation: data.presentation,
        color: (data.color ?? '').toString().trim() || null,
        expiryDate: toDate(data.expiryDate),       // 👈 normaliza
        location: (data.location ?? '').toString().trim() || null,
        quantity: toInt(data.quantity),            // 👈 normaliza
        unitPrice: toDecimal(data.unitPrice),      // 👈 Decimal
        currency: data.currency ?? 'USD',
        comment: data.comment ?? '',
      }
    });

    res.json(created);
  } catch (e: any) {
    console.error('Error al crear:', e?.message || e);
    res.status(400).json({ ok: false, message: 'Error al crear' });
  }
});

// ---------- Editar (PUT) ----------
app.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    // Validar duplicado en otro registro
    if (data.code || data.batch) {
      const exists = await prisma.product.findFirst({
        where: {
          code: data.code,
          batch: (data.batch ?? '').toString().trim() || null,
          NOT: { id }
        }
      });
      if (exists) return res.status(409).json({ ok: false, message: 'Duplicado code+batch' });
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.batch !== undefined ? { batch: (data.batch ?? '').toString().trim() || null } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.brand !== undefined ? { brand: data.brand } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.subtype !== undefined ? { subtype: (data.subtype ?? '').toString().trim() || null } : {}),
        ...(data.presentation !== undefined ? { presentation: data.presentation } : {}),
        ...(data.color !== undefined ? { color: (data.color ?? '').toString().trim() || null } : {}),
        ...(data.expiryDate !== undefined ? { expiryDate: toDate(data.expiryDate) } : {}),
        ...(data.location !== undefined ? { location: (data.location ?? '').toString().trim() || null } : {}),
        ...(data.quantity !== undefined ? { quantity: toInt(data.quantity) } : {}),
        ...(data.unitPrice !== undefined ? { unitPrice: toDecimal(data.unitPrice) } : {}), // 👈 Decimal
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.comment !== undefined ? { comment: data.comment } : {}),
      }
    });

    res.json(updated);
  } catch (e: any) {
    if (e?.code === 'P2025') {
      return res.status(404).json({ ok: false, message: 'Producto no encontrado' });
    }
    console.error('Error al actualizar:', e?.message || e);
    res.status(400).json({ ok: false, message: 'Error al actualizar' });
  }
});

// ---------- Eliminar ----------
app.delete('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.product.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.code === 'P2025') {
      return res.status(404).json({ ok: false, message: 'No encontrado' });
    }
    console.error('Error al eliminar:', e?.message || e);
    res.status(400).json({ ok: false, message: 'Error al eliminar' });
  }
});
// Actualizar
app.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    // … (validación y prisma.product.update)
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ ok:false, message:'Producto no encontrado' });
    res.status(400).json({ ok:false, message:'Error al actualizar' });
  }
});

app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});

