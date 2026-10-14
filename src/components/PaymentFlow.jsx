import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/payment-flow.css';
import { formatCurrency } from '../lib/formatters';

export default function PaymentFlow({ payment, onClose }) {
  const [method, setMethod] = useState('mpesa');
  const [school, setSchool] = useState(null);

  useEffect(() => {
    let active = true;
    const fetchSchool = async () => {
      if (!payment?.school_id || !supabase) return;
      const { data } = await supabase.from('schools')
        .select('name, mpesa_paybill, bank_name, bank_account_name, bank_account_number, currency_code')
        .eq('id', payment.school_id).maybeSingle();
      if (active) setSchool(data || null);
    };
    fetchSchool();
    return () => { active = false; };
  }, [payment?.school_id]);

  return (
    <div className="payment-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="payment-modal glass-card" role="dialog" aria-modal="true" aria-labelledby="payment-title">
        <div className="payment-step">
          <h2 id="payment-title">Payment instructions</h2>
          <p className="payment-summary">For: <b>{payment.name || payment.reference}</b></p>
          <div className="payment-amount">{formatCurrency(payment.amount, school?.currency_code)}</div>
          <p>Use the school’s official payment channel, then share the transaction reference with the school office. The school administrator will confirm the payment in the portal.</p>
          <div className="method-selector" role="group" aria-label="Payment method">
            <button type="button" className={`method-btn ${method === 'mpesa' ? 'active' : ''}`} aria-pressed={method === 'mpesa'} onClick={() => setMethod('mpesa')}>M-Pesa</button>
            <button type="button" className={`method-btn ${method === 'bank' ? 'active' : ''}`} aria-pressed={method === 'bank'} onClick={() => setMethod('bank')}>Bank transfer</button>
          </div>
          <div className="payment-instructions glass-card" style={{ marginTop: 20, padding: 15, background: 'rgba(255,255,255,0.05)', fontSize: '0.9rem' }}>
            {method === 'mpesa' ? (
              <>
                <p><b>{school?.name || 'School'} M-Pesa details</b></p>
                <p>Paybill: <b>{school?.mpesa_paybill || 'Contact the school office'}</b></p>
                <p>Account/reference: <b>{payment.reference || 'Ask the school office'}</b></p>
              </>
            ) : (
              <>
                <p><b>{school?.name || 'School'} bank details</b></p>
                <p>Bank: <b>{school?.bank_name || 'Contact the school office'}</b></p>
                <p>Account name: <b>{school?.bank_account_name || school?.name || 'Contact the school office'}</b></p>
                <p>Account number: <b>{school?.bank_account_number || 'Contact the school office'}</b></p>
              </>
            )}
          </div>
          <p role="status" style={{ marginTop: 16 }}>Online checkout is not connected yet. This screen cannot confirm payment or issue an official receipt.</p>
          <div className="payment-actions" style={{ marginTop: 20 }}>
            <button type="button" className="button blue-button full" onClick={onClose}>Close</button>
          </div>
        </div>
      </section>
    </div>
  );
}
