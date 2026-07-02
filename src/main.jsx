import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './lib/supabase'
import Papa from 'papaparse'
import { Search, Truck, CheckCircle2, Upload, Plus, LogOut, Package, Mail, Pencil, Trash2 } from 'lucide-react'
import './styles.css'

const emptyOrder = {
  order_number: '', customer_email: '', customer_name: '', customer_lastname: '', dni: '', address: '', product: '', logistic_operator: ''
}

function statusLabel(status) {
  return { pending: 'Pendiente', in_transit: 'En camino', delivered: 'Entregada', issue: 'Con problema' }[status] || status
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [route, setRoute] = useState(window.location.pathname)

  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname)
    window.addEventListener('popstate', onPop)
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => { window.removeEventListener('popstate', onPop); sub.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    async function loadProfile() {
      if (!session?.user) { setProfile(null); return }
      const { data } = await supabase.from('profiles').select('*, sellers(*)').eq('id', session.user.id).single()
      setProfile(data)
    }
    loadProfile()
  }, [session])

  if (route.startsWith('/tracking/')) return <Tracking token={route.split('/').pop()} />
  if (loading) return <div className="center">Cargando...</div>
  if (!session) return <Login />
  if (!profile) return <div className="center">Preparando perfil...</div>
  return <Dashboard profile={profile} />
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault(); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
  }
  return <main className="loginPage"><section className="loginCard"><div className="brand"><Truck size={34}/><div><h1>Logística Sellers</h1><p>Despacho rápido y confirmación de entrega</p></div></div><form onSubmit={submit} className="form"><input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} /><input placeholder="Contraseña" type="password" value={password} onChange={e=>setPassword(e.target.value)} /><button>Ingresar</button>{error && <small className="error">{error}</small>}</form></section></main>
}

function Dashboard({ profile }) {
  const [orders, setOrders] = useState([])
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('pending')
  const [selected, setSelected] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const isAdmin = profile.role === 'admin'

  async function load() {
    let q = supabase.from('orders').select('*, sellers(name)').is('deleted_at', null).order('created_at', { ascending: false })
    if (!isAdmin) q = q.eq('seller_id', profile.seller_id)
    const { data } = await q
    setOrders(data || [])
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => orders.filter(o => o.status === tab).filter(o => {
    const text = `${o.order_number} ${o.customer_email} ${o.customer_name} ${o.customer_lastname} ${o.dni} ${o.product}`.toLowerCase()
    return text.includes(query.toLowerCase())
  }), [orders, tab, query])

  const counts = useMemo(() => ({ pending: orders.filter(o=>o.status==='pending').length, in_transit: orders.filter(o=>o.status==='in_transit').length, delivered: orders.filter(o=>o.status==='delivered').length }), [orders])

  async function markInTransit() {
    if (!selected.length) return
    const appUrl = import.meta.env.VITE_APP_URL || window.location.origin
    for (const id of selected) {
      const order = orders.find(o => o.id === id)
      const trackingUrl = `${appUrl}/tracking/${order.tracking_token}`
      await supabase.from('orders').update({ status: 'in_transit', dispatched_at: new Date().toISOString(), tracking_url: trackingUrl }).eq('id', id)
      await supabase.from('tracking_events').insert({ order_id: id, event_type: 'in_transit', detail: 'El seller marcó la orden como salida a entregar.' })
      await supabase.functions.invoke('send-dispatch-email', { body: { order_id: id } }).catch(() => null)
    }
    setSelected([]); load()
  }

  async function removeOrder(id) {
    if (!confirm('¿Eliminar esta orden? Quedará archivada para auditoría.')) return
    await supabase.from('orders').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  return <main className="app"><header className="topbar"><div><h1>Panel logístico</h1><p>{isAdmin ? 'Vista administrador' : profile.sellers?.name}</p></div><button className="ghost" onClick={()=>supabase.auth.signOut()}><LogOut size={18}/> Salir</button></header>
    <section className="kpis"><Kpi title="Pendientes" value={counts.pending} icon={<Package/>}/><Kpi title="En camino" value={counts.in_transit} icon={<Truck/>}/><Kpi title="Entregadas" value={counts.delivered} icon={<CheckCircle2/>}/></section>
    <section className="panel"><div className="actions"><div className="search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por orden, DNI, email o cliente"/></div><button onClick={()=>setShowForm(true)}><Plus size={18}/> Carga manual</button><CsvImport profile={profile} onDone={load}/></div>
      <div className="tabs"><button className={tab==='pending'?'active':''} onClick={()=>setTab('pending')}>Pendientes</button><button className={tab==='in_transit'?'active':''} onClick={()=>setTab('in_transit')}>En camino</button><button className={tab==='delivered'?'active':''} onClick={()=>setTab('delivered')}>Entregadas</button></div>
      {tab==='pending' && <button className="primary wide" onClick={markInTransit}>Marcar seleccionadas como “Sale a entregar”</button>}
      <div className="list">{filtered.map(o => <article className="order" key={o.id}><label className="check">{tab==='pending' && <input type="checkbox" checked={selected.includes(o.id)} onChange={e=> setSelected(s => e.target.checked ? [...s,o.id] : s.filter(x=>x!==o.id))}/>}<div><h3>Orden {o.order_number}</h3><p>{o.customer_name} {o.customer_lastname} · DNI {o.dni}</p><p>{o.product || 'Producto sin detalle'} · {o.customer_email}</p>{isAdmin && <small>Seller: {o.sellers?.name}</small>}</div></label><span className={`badge ${o.status}`}>{statusLabel(o.status)}</span><div className="rowBtns"><button className="ghost" onClick={()=>{setEditing(o); setShowForm(true)}}><Pencil size={16}/></button><button className="ghost danger" onClick={()=>removeOrder(o.id)}><Trash2 size={16}/></button></div></article>)}</div>
    </section>{showForm && <OrderForm profile={profile} order={editing} onClose={()=>{setShowForm(false); setEditing(null)}} onDone={()=>{setShowForm(false); setEditing(null); load()}}/>}</main>
}

function Kpi({ title, value, icon }) { return <div className="kpi"><div>{icon}</div><p>{title}</p><strong>{value}</strong></div> }

function CsvImport({ profile, onDone }) {
  async function upload(e) {
    const file = e.target.files[0]; if (!file) return
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: async ({ data }) => {
      const rows = data.map(r => ({ seller_id: profile.seller_id, order_number: r.order_number || r.orden || r.Orden, customer_email: r.customer_email || r.email, customer_name: r.customer_name || r.nombre, customer_lastname: r.customer_lastname || r.apellido, dni: r.dni || r.DNI, address: r.address || r.direccion, product: r.product || r.producto, logistic_operator: r.logistic_operator || r.operador, status: 'pending' }))
      await supabase.from('orders').upsert(rows, { onConflict: 'seller_id,order_number' })
      onDone(); e.target.value = ''
    }})
  }
  return <label className="fileBtn"><Upload size={18}/> Importar CSV<input type="file" accept=".csv" hidden onChange={upload}/></label>
}

function OrderForm({ profile, order, onClose, onDone }) {
  const [form, setForm] = useState(order || emptyOrder)
  async function save(e) {
    e.preventDefault()
    const payload = { ...form, seller_id: order?.seller_id || profile.seller_id, status: order?.status || 'pending' }
    if (order?.id) await supabase.from('orders').update(payload).eq('id', order.id)
    else await supabase.from('orders').insert(payload)
    onDone()
  }
  return <div className="modal"><form className="modalCard" onSubmit={save}><h2>{order ? 'Editar orden' : 'Carga manual'}</h2>{Object.keys(emptyOrder).map(k => <input key={k} placeholder={k} value={form[k] || ''} onChange={e=>setForm({...form,[k]:e.target.value})}/>)}<div className="modalActions"><button type="button" className="ghost" onClick={onClose}>Cancelar</button><button>Guardar</button></div></form></div>
}

function Tracking({ token }) {
  const [order, setOrder] = useState(null); const [dni, setDni] = useState(''); const [done, setDone] = useState(false)
  useEffect(() => { supabase.from('orders').select('*').eq('tracking_token', token).single().then(({data})=>setOrder(data)) }, [token])
  async function confirmDelivery() {
    if (!order) return
    if (!order.dni?.endsWith(dni)) { alert('Los números de DNI no coinciden.'); return }
    await supabase.from('orders').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', order.id)
    await supabase.from('customer_confirmations').insert({ order_id: order.id, dni_last_digits: dni })
    await supabase.from('tracking_events').insert({ order_id: order.id, event_type: 'delivered', detail: 'Entrega confirmada por el cliente.' })
    setDone(true)
  }
  if (!order) return <div className="center">Buscando envío...</div>
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address || '')}`
  return <main className="tracking"><section className="trackingCard"><Truck size={42}/><h1>Seguimiento de tu compra</h1><p>Orden {order.order_number}</p><span className={`badge ${order.status}`}>{statusLabel(order.status)}</span><div className="info"><p><b>Producto:</b> {order.product}</p><p><b>Dirección:</b> {order.address}</p></div><a className="mapBtn" href={maps} target="_blank">Ver ubicación en Google Maps</a>{done || order.status==='delivered' ? <h2 className="success">Entrega confirmada. ¡Gracias!</h2> : <div className="confirm"><p>Cuando recibas el producto, confirmá la entrega.</p><input placeholder="Últimos números de DNI" value={dni} onChange={e=>setDni(e.target.value)} /><button onClick={confirmDelivery}>Confirmar que recibí mi compra</button></div>}</section></main>
}

createRoot(document.getElementById('root')).render(<App />)
