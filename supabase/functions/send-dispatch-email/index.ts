import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const { order_id } = await req.json()
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', order_id).single()
    if (error || !order) throw error

    const appUrl = Deno.env.get('APP_URL') || ''
    const trackingUrl = order.tracking_url || `${appUrl}/tracking/${order.tracking_token}`
    const subject = `Tu compra ${order.order_number} salió a distribución`
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#172033">
        <h2>Hola ${order.customer_name || ''}, tu compra ya salió a distribución</h2>
        <p>La compra <b>N° ${order.order_number}</b> fue marcada como salida para entrega.</p>
        <p>El operador logístico estará visitándote para entregar tu producto.</p>
        <p><b>Producto:</b> ${order.product || 'Producto informado en tu compra'}</p>
        <a href="${trackingUrl}" style="display:inline-block;background:#172033;color:white;padding:14px 18px;border-radius:12px;text-decoration:none;font-weight:bold">Ver seguimiento</a>
        <p style="margin-top:18px;color:#64748b">Cuando recibas el producto, confirmá la entrega desde el mismo link.</p>
      </div>`

    const resendKey = Deno.env.get('RESEND_API_KEY')
    let provider_response = {}
    let status = 'skipped'

    if (resendKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: Deno.env.get('EMAIL_FROM') || 'Logistica <no-reply@example.com>', to: order.customer_email, subject, html })
      })
      provider_response = await res.json().catch(() => ({}))
      status = res.ok ? 'sent' : 'error'
    }

    await supabase.from('email_logs').insert({ order_id, recipient: order.customer_email, subject, status, provider_response })
    return new Response(JSON.stringify({ ok: true, status, trackingUrl }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
})
