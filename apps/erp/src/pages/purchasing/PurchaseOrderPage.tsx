import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, Download, Mail, PackageCheck, Phone, Plus, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PartRow } from '@eurowerken/shared';
import { formatDateTime, getTimeZone } from '@/api/appointments';
import { listPartCosts, listParts, parseNumber } from '@/api/catalogue';
import {
  EMAIL_STATE_LABEL,
  EMAIL_STATE_TONE,
  addPoLine,
  canCancel,
  canEmail,
  canReceive,
  cancelPo,
  deleteDraft,
  deletePoLine,
  downloadPoPdf,
  emailPoToSupplier,
  formatQty,
  getPurchaseOrder,
  isDraft,
  lineProblem,
  lineTotal,
  listPoEmails,
  listPoLines,
  listPoReceipts,
  markPoSent,
  poTotal,
  remaining,
  subscribePurchaseOrder,
  updatePoLine,
  updatePurchaseOrder,
} from '@/api/purchaseOrders';
import type { LineInput, PoDetail, PoEmail, PoLine, PoReceipt, PurchaseOrder } from '@/api/purchaseOrders';
import { listSuppliers } from '@/api/suppliers';
import type { Supplier } from '@/api/suppliers';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/format';
import { ErrorNote, Labeled, inputClass } from '../inventory/PartForm';
import { Confirm, SectionTitle, iconButton, textLink } from '../repair-orders/common';
import { PartsTechCard, PoStatusBadge, formatDay, selectClass } from './common';
import { ReceiveDialog } from './ReceiveDialog';

type Busy = null | 'pdf' | 'email' | 'sent' | 'cancel' | 'delete' | 'save';

/** One purchase order: lines (editable while a draft), notes, PDF, email, receiving and cancelling. */
export function PurchaseOrderPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const canEdit = can('inventory', 'full');

  const [detail, setDetail] = useState<PoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [emails, setEmails] = useState<PoEmail[]>([]);
  const [receipts, setReceipts] = useState<PoReceipt[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [parts, setParts] = useState<PartRow[]>([]);
  const [costs, setCosts] = useState<Map<string, number>>(new Map());
  const [tz, setTz] = useState('America/Edmonton');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'cancel' | 'delete'>(null);
  const [receiving, setReceiving] = useState(false);

  const loadSide = useCallback(async () => {
    const [e, r] = await Promise.all([listPoEmails(id).catch(() => [] as PoEmail[]), listPoReceipts(id).catch(() => [] as PoReceipt[])]);
    setEmails(e);
    setReceipts(r);
  }, [id]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setDetail(await getPurchaseOrder(id));
      void loadSide();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'The purchase order could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [id, loadSide]);

  useEffect(() => {
    setLoading(true);
    void load();
    return subscribePurchaseOrder(id, (table) => {
      if (table === 'supplier_outbox') void loadSide();
      else void load();
    });
  }, [id, load, loadSide]);

  useEffect(() => {
    if (!workshopId) return;
    void getTimeZone(workshopId).then(setTz).catch(() => undefined);
    if (!canEdit) return;
    void listSuppliers(workshopId).then(setSuppliers).catch(() => undefined);
    void Promise.all([listParts(workshopId), listPartCosts(workshopId)])
      .then(([p, c]) => {
        setParts(p);
        setCosts(c);
      })
      .catch(() => undefined);
  }, [workshopId, canEdit]);

  async function run<T>(label: Exclude<Busy, null>, work: () => Promise<T>, done?: string): Promise<T | null> {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const out = await work();
      if (done) setNotice(done);
      return out;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  const setOrder = (o: PurchaseOrder) => setDetail((d) => (d ? { ...d, order: o } : d));
  const setLines = (lines: PoLine[]) => setDetail((d) => (d ? { ...d, lines } : d));
  const refreshLines = async () => setLines(await listPoLines(id));

  if (loading) {
    return (
      <p role="status" className="py-10 text-center text-xs text-fg2">
        Loading purchase order...
      </p>
    );
  }
  if (loadError) {
    return (
      <div className="space-y-3">
        <ErrorNote errors={loadError} />
        <Button variant="ghost" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!detail) {
    return (
      <Card className="space-y-3 p-6 text-xs text-fg2">
        <p>This purchase order was not found, or your role cannot see it.</p>
        <Link to="/purchasing" className={textLink}>
          Back to Purchasing
        </Link>
      </Card>
    );
  }

  const { order, lines, supplier, repair } = detail;
  const draft = isDraft(order);
  const open = order.status !== 'received' && order.status !== 'cancelled';
  const toCome = lines.reduce((a, l) => a + remaining(l), 0);
  const waitingEmail = emails.some((e) => e.state === 'pending' || e.state === 'sending');

  const emailReason = !canEdit
    ? 'You need full access to Parts Inventory.'
    : !canEmail(order)
      ? `This order is ${order.status}.`
      : lines.length === 0
        ? 'Add at least one line first.'
        : !supplier?.email
          ? `${supplier?.name ?? 'This supplier'} has no email address. Add one under Suppliers, or use Mark as sent.`
          : waitingEmail
            ? 'The email is already waiting to send.'
            : null;

  return (
    <div className="space-y-4">
      <Link to="/purchasing" className={`${textLink} text-xs`}>
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Purchasing
      </Link>

      <Card className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-lg font-semibold text-fg">{order.number}</h1>
              <PoStatusBadge status={order.status} />
            </div>
            <p className="text-xs text-fg2">
              To <strong className="text-fg">{supplier?.name ?? 'Supplier'}</strong>
              {supplier?.email && <> · {supplier.email}</>}
              {supplier?.phone && <> · {supplier.phone}</>}
            </p>
            <p className="text-[11px] text-fg3">
              Created {formatDateTime(order.created_at, tz)}
              {order.sent_at && <> · ordered {formatDateTime(order.sent_at, tz)}</>}
              {order.received_at && <> · received {formatDateTime(order.received_at, tz)}</>}
              {order.cancelled_at && <> · cancelled {formatDateTime(order.cancelled_at, tz)}</>}
            </p>
            {order.repair_order_id && (
              <p className="text-xs">
                {repair ? (
                  <Link to={`/repair-orders/${repair.id}`} className={textLink}>
                    For repair {repair.number}
                  </Link>
                ) : (
                  <span className="text-fg2">For a repair order</span>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" disabled={busy !== null} onClick={() => void run('pdf', () => downloadPoPdf(order.id))}>
              <Download className="h-3.5 w-3.5" aria-hidden />
              {busy === 'pdf' ? 'Making PDF...' : 'Download PDF'}
            </Button>
            {canEdit && open && (
              <>
                <Button
                  disabled={busy !== null || emailReason !== null}
                  title={emailReason ?? undefined}
                  onClick={() =>
                    void run('email', async () => setOrder(await emailPoToSupplier(order)), `Queued: ${order.number} is being emailed to ${supplier?.email}.`)
                  }
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden />
                  {busy === 'email' ? 'Sending...' : order.status === 'draft' ? 'Email to supplier' : 'Email again'}
                </Button>
                {draft && (
                  <Button
                    variant="ghost"
                    disabled={busy !== null || lines.length === 0}
                    title={lines.length === 0 ? 'Add at least one line first.' : 'Ordered by phone, online or at the counter.'}
                    onClick={() => void run('sent', async () => setOrder(await markPoSent(order.id)), `${order.number} is marked as ordered.`)}
                  >
                    <Phone className="h-3.5 w-3.5" aria-hidden />
                    {busy === 'sent' ? 'Saving...' : 'Mark as sent'}
                  </Button>
                )}
                {canReceive(order) && toCome > 0 && (
                  <Button variant="ghost" disabled={busy !== null} onClick={() => setReceiving(true)}>
                    <PackageCheck className="h-3.5 w-3.5" aria-hidden />
                    Receive
                  </Button>
                )}
                {canCancel(order) && !draft && (
                  <Button variant="ghost" disabled={busy !== null} onClick={() => setConfirm('cancel')} className="hover:!text-bad">
                    Cancel order
                  </Button>
                )}
                {draft && (
                  <Button variant="ghost" disabled={busy !== null} onClick={() => setConfirm('delete')} className="hover:!text-bad">
                    Delete draft
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
        {canEdit && open && emailReason && !waitingEmail && lines.length > 0 && canEmail(order) && (
          <p className="text-[11px] text-fg3">{emailReason}</p>
        )}
        {!canEdit && (
          <p className="text-[11px] text-fg3">View only. Staff with full access to Parts Inventory edit, send and receive purchase orders.</p>
        )}
        <ErrorNote errors={error} />
        {notice && (
          <p role="status" className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-xs text-ok">
            {notice}
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <LinesCard
            order={order}
            lines={lines}
            parts={parts}
            costs={costs}
            editable={canEdit && draft}
            onLines={setLines}
            onRefresh={refreshLines}
          />
          {receipts.length > 0 && <ReceiptsCard receipts={receipts} lines={lines} tz={tz} />}
        </div>
        <div className="min-w-0 space-y-4">
          <DetailsCard
            key={`${order.id}:${order.status}`}
            order={order}
            suppliers={suppliers}
            canEdit={canEdit && open}
            tz={tz}
            onOrder={setOrder}
          />
          <EmailsCard emails={emails} tz={tz} />
          <PartsTechCard />
        </div>
      </div>

      {canEdit && (
        <ReceiveDialog
          open={receiving}
          order={order}
          lines={lines}
          onClose={() => setReceiving(false)}
          onReceived={(o) => {
            setOrder(o);
            setNotice(o.status === 'received' ? `${o.number} is fully received. Stock is updated.` : `Received. The rest of ${o.number} is still to come.`);
            void refreshLines();
            void loadSide();
          }}
        />
      )}

      <Confirm
        open={confirm === 'cancel'}
        title={`Cancel ${order.number}`}
        message={
          <>
            Nothing more will be received on this order. Stock already received stays. An email still waiting to send is not sent. Tell{' '}
            {supplier?.name ?? 'the supplier'} yourself if they already have the order.
          </>
        }
        confirmLabel="Cancel order"
        busyLabel="Cancelling..."
        busy={busy === 'cancel'}
        error={confirm === 'cancel' ? error : null}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          void run('cancel', async () => {
            setOrder(await cancelPo(order.id));
            setConfirm(null);
          }, `${order.number} is cancelled.`)
        }
      />
      <Confirm
        open={confirm === 'delete'}
        title={`Delete ${order.number}`}
        message="Delete this draft and its lines? Nothing was sent. This cannot be undone."
        confirmLabel="Delete draft"
        busyLabel="Deleting..."
        busy={busy === 'delete'}
        error={confirm === 'delete' ? error : null}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          void run('delete', async () => {
            await deleteDraft(order.id);
            navigate('/purchasing', { replace: true });
          })
        }
      />
    </div>
  );
}

// Lines ---------------------------------------------------------------------------------------------------------

interface LineDraft {
  part_id: string;
  description: string;
  part_number: string;
  quantity: string;
  unit_cost: string;
}

const EMPTY_LINE: LineDraft = { part_id: '', description: '', part_number: '', quantity: '1', unit_cost: '' };

function toInput(d: LineDraft): { input: LineInput | null; problem: string | null } {
  const q = parseNumber(d.quantity);
  const c = parseNumber(d.unit_cost);
  if (q === null || Number.isNaN(q)) return { input: null, problem: 'Enter a quantity.' };
  if (c !== null && Number.isNaN(c)) return { input: null, problem: 'The unit cost must be a number.' };
  const input: LineInput = {
    part_id: d.part_id || null,
    description: d.description,
    part_number: d.part_number.trim() || null,
    quantity: q,
    unit_cost: c ?? 0,
  };
  return { input, problem: lineProblem(input) };
}

function LinesCard({
  order,
  lines,
  parts,
  costs,
  editable,
  onLines,
  onRefresh,
}: {
  order: PurchaseOrder;
  lines: PoLine[];
  parts: PartRow[];
  costs: Map<string, number>;
  editable: boolean;
  onLines: (lines: PoLine[]) => void;
  onRefresh: () => Promise<void>;
}) {
  const id = useId();
  const [draft, setDraft] = useState<LineDraft>(EMPTY_LINE);
  const [editing, setEditing] = useState<{ id: string; draft: LineDraft } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const total = poTotal(lines);
  const partById = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);
  const sortedParts = useMemo(() => [...parts].sort((a, b) => a.name.localeCompare(b.name)), [parts]);

  function pickPart(partId: string, target: 'new' | 'edit') {
    const p = partById.get(partId);
    const patch: Partial<LineDraft> = p
      ? { part_id: p.id, description: p.name, part_number: p.part_number ?? p.sku ?? '', unit_cost: costs.has(p.id) ? String(costs.get(p.id)) : '' }
      : { part_id: '' };
    if (target === 'new') setDraft((d) => ({ ...d, ...patch }));
    else setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));
  }

  async function act(label: string, work: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
      // The order may have been sent from another screen: show what is there now.
      await onRefresh().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const { input, problem } = toInput(draft);
    if (!input || problem) {
      setError(problem);
      return;
    }
    await act('add', async () => {
      const line = await addPoLine(order, lines, input);
      onLines([...lines, line]);
      setDraft(EMPTY_LINE);
    });
  }

  async function saveEdit() {
    if (!editing) return;
    const line = lines.find((l) => l.id === editing.id);
    if (!line) return;
    const { input, problem } = toInput(editing.draft);
    if (!input || problem) {
      setError(problem);
      return;
    }
    await act(line.id, async () => {
      const saved = await updatePoLine(line, input);
      onLines(lines.map((l) => (l.id === saved.id ? saved : l)));
      setEditing(null);
    });
  }

  const partOptions = (
    <>
      <option value="">Not an inventory part (free text)</option>
      {sortedParts.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.sku ? ` · ${p.sku}` : ''} (stock {p.stock})
        </option>
      ))}
    </>
  );

  const fields = (d: LineDraft, set: (patch: Partial<LineDraft>) => void, prefix: string, target: 'new' | 'edit') => (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_5rem_6rem]">
      <Labeled id={`${prefix}-part`} label="Inventory part">
        <select id={`${prefix}-part`} value={d.part_id} onChange={(e) => pickPart(e.target.value, target)} className={selectClass}>
          {partOptions}
        </select>
      </Labeled>
      <Labeled id={`${prefix}-desc`} label="Description">
        <input id={`${prefix}-desc`} value={d.description} onChange={(e) => set({ description: e.target.value })} className={inputClass} maxLength={300} />
      </Labeled>
      <Labeled id={`${prefix}-pn`} label="Part number">
        <input id={`${prefix}-pn`} value={d.part_number} onChange={(e) => set({ part_number: e.target.value })} className={inputClass} maxLength={60} />
      </Labeled>
      <Labeled id={`${prefix}-qty`} label="Qty">
        <input id={`${prefix}-qty`} inputMode="decimal" value={d.quantity} onChange={(e) => set({ quantity: e.target.value })} className={inputClass} />
      </Labeled>
      <Labeled id={`${prefix}-cost`} label="Unit cost">
        <input id={`${prefix}-cost`} inputMode="decimal" value={d.unit_cost} onChange={(e) => set({ unit_cost: e.target.value })} placeholder="0.00" className={inputClass} />
      </Labeled>
    </div>
  );

  return (
    <Card className="space-y-3 p-4 md:p-5">
      <SectionTitle
        id={`${id}-title`}
        title="Lines"
        subtitle={editable ? 'Pick a part from inventory, or type a free-text line.' : order.status === 'draft' ? undefined : 'Lines are fixed once the order is sent.'}
      />
      {lines.length === 0 ? (
        <p className="text-xs text-fg2">No lines yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {lines.map((l) =>
            editing?.id === l.id ? (
              <li key={l.id} className="space-y-2 p-3">
                {fields(editing.draft, (patch) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e)), `${id}-${l.id}`, 'edit')}
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy !== null} onClick={() => void saveEdit()}>
                    {busy === l.id ? 'Saving...' : 'Save line'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </div>
              </li>
            ) : (
              <li key={l.id} className="flex flex-wrap items-start justify-between gap-3 p-3 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="break-words font-medium text-fg">{l.description}</div>
                  <div className="mt-0.5 text-[11px] text-fg3">
                    {[l.part_number, l.part_id ? 'inventory part' : null, l.repair_order_item_id ? 'from the repair order' : null].filter(Boolean).join(' · ') || 'Free text'}
                  </div>
                  {order.status !== 'draft' && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-fg2">
                      Received {formatQty(l.received_qty)} of {formatQty(l.quantity)}
                      {remaining(l) === 0 ? <Badge tone="ok">Complete</Badge> : order.status !== 'cancelled' && <Badge tone="warn">{formatQty(remaining(l))} to come</Badge>}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-fg2">
                    {formatQty(l.quantity)} × {formatCurrency(l.unit_cost)}
                  </div>
                  <div className="font-semibold text-fg">{formatCurrency(lineTotal(l))}</div>
                </div>
                {editable && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditing({
                          id: l.id,
                          draft: {
                            part_id: l.part_id ?? '',
                            description: l.description,
                            part_number: l.part_number ?? '',
                            quantity: formatQty(l.quantity),
                            unit_cost: String(l.unit_cost),
                          },
                        })
                      }
                    >
                      Edit
                    </Button>
                    <button
                      type="button"
                      className={`${iconButton} hover:!text-bad`}
                      aria-label={`Remove ${l.description}`}
                      disabled={busy !== null}
                      onClick={() =>
                        void act(l.id, async () => {
                          await deletePoLine(l.id);
                          onLines(lines.filter((x) => x.id !== l.id));
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}
      <div className="flex justify-end text-xs text-fg2">
        Estimated total before tax: <strong className="ml-1 text-fg">{formatCurrency(total)}</strong>
      </div>

      {editable && (
        <form onSubmit={(e) => void add(e)} className="space-y-2 rounded-lg border border-dashed border-line p-3" noValidate>
          <p className="text-xs font-semibold text-fg">Add a line</p>
          {fields(draft, (patch) => setDraft((d) => ({ ...d, ...patch })), `${id}-new`, 'new')}
          <Button type="submit" size="sm" disabled={busy !== null}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {busy === 'add' ? 'Adding...' : 'Add line'}
          </Button>
        </form>
      )}
      <ErrorNote errors={error} />
    </Card>
  );
}

// Details: supplier (draft), expected date and notes -------------------------------------------------------------

function DetailsCard({
  order,
  suppliers,
  canEdit,
  tz,
  onOrder,
}: {
  order: PurchaseOrder;
  suppliers: Supplier[];
  canEdit: boolean;
  tz: string;
  onOrder: (o: PurchaseOrder) => void;
}) {
  const id = useId();
  const [supplierId, setSupplierId] = useState(order.supplier_id);
  const [expected, setExpected] = useState(order.expected_at ?? '');
  const [notes, setNotes] = useState(order.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = supplierId !== order.supplier_id || expected !== (order.expected_at ?? '') || notes.trim() !== (order.notes ?? '');
  const choices = suppliers.filter((s) => s.active || s.id === order.supplier_id);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (notes.trim().length > 2000) {
      setError('Notes can be at most 2000 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const patch = { expected_at: expected || null, notes, ...(order.status === 'draft' && supplierId !== order.supplier_id ? { supplier_id: supplierId } : {}) };
      onOrder(await updatePurchaseOrder(order.id, patch));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The changes could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit) {
    return (
      <Card className="space-y-2 p-4 text-xs">
        <SectionTitle id={`${id}-t`} title="Details" />
        <p className="text-fg2">
          Needed by: <span className="text-fg">{order.expected_at ? formatDay(order.expected_at, tz) : 'Not set'}</span>
        </p>
        <p className="whitespace-pre-wrap break-words text-fg2">{order.notes || 'No notes.'}</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <form onSubmit={(e) => void save(e)} className="space-y-3">
        <SectionTitle id={`${id}-t`} title="Details" subtitle="Printed on the PDF and in the email." />
        {order.status === 'draft' && choices.length > 0 && (
          <Labeled id={`${id}-sup`} label="Supplier">
            <select id={`${id}-sup`} value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={selectClass}>
              {choices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.email ? '' : ' (no email)'}
                </option>
              ))}
            </select>
          </Labeled>
        )}
        <Labeled id={`${id}-exp`} label="Needed by">
          <input id={`${id}-exp`} type="date" value={expected} onChange={(e) => setExpected(e.target.value)} className={inputClass} />
        </Labeled>
        <Labeled id={`${id}-notes`} label="Notes to the supplier">
          <textarea id={`${id}-notes`} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} className={inputClass} />
        </Labeled>
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={busy || !dirty}>
            {busy ? 'Saving...' : 'Save details'}
          </Button>
          {saved && !dirty && <span className="text-[11px] text-ok">Saved</span>}
        </div>
        <ErrorNote errors={error} />
      </form>
    </Card>
  );
}

function EmailsCard({ emails, tz }: { emails: PoEmail[]; tz: string }) {
  const id = useId();
  return (
    <Card className="space-y-2 p-4">
      <SectionTitle id={`${id}-t`} title="Emails" subtitle="Purchase orders emailed to the supplier." />
      {emails.length === 0 ? (
        <p className="text-xs text-fg2">Not emailed yet.</p>
      ) : (
        <ul className="space-y-2">
          {emails.map((e) => (
            <li key={e.id} className="text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={EMAIL_STATE_TONE[e.state]}>{EMAIL_STATE_LABEL[e.state]}</Badge>
                <span className="break-all text-fg2">{e.to_address}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-fg3">
                {formatDateTime(e.sent_at ?? e.created_at, tz)}
                {e.last_error && e.state !== 'sent' && <> · {e.last_error}</>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {emails.some((e) => e.state === 'pending') && (
        <p className="text-[11px] text-fg3">If an email stays waiting, the mail sender is not set up yet (see the customer-mailer setup).</p>
      )}
    </Card>
  );
}

function ReceiptsCard({ receipts, lines, tz }: { receipts: PoReceipt[]; lines: PoLine[]; tz: string }) {
  const id = useId();
  const name = new Map(lines.map((l) => [l.id, l.description]));
  return (
    <Card className="space-y-2 p-4 md:p-5">
      <SectionTitle id={`${id}-t`} title="Received" subtitle="Every delivery booked in, newest first." />
      <ul className="divide-y divide-line text-xs">
        {receipts.map((r) => (
          <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2">
            <span className="text-fg">
              {formatQty(r.quantity)} × {name.get(r.line_id) ?? 'Line'} at {formatCurrency(r.unit_cost)}
            </span>
            <span className="text-fg3">{formatDateTime(r.received_at, tz)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
