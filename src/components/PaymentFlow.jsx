import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/payment-flow.css';
import { formatCurrency } from '../lib/formatters';

export default function PaymentFlow({ payment, onClose }) {
  const [method, setMethod] = useState('mobile');
  const [school, setSchool] = useState(null);

  useEffect(() => {
    let active = true;
    const fetchSchool = async () => {
      if (!payment?.school_id || !supabase) return;
      const { data, error } = await supabase.rpc('get_my_payment_school_details', { p_payment_id: payment.id });
      if (error) console.error('Could not load payment instructions:', error.message);
      if (active) setSchool(data || null);
    };
    fetchSchool();
    return () => { active = false; };
  }, [payment?.school_id]);

  const mobileProvider = school?.mobile_money_provider || (school?.mpesa_paybill || school?.mpesa_till ? 'M-Pesa' : '');
  const mobileNumber = school?.mobile_money_number || school?.mpesa_paybill || school?.mpesa_till;
  const hasMobile = Boolean(mobileProvider && mobileNumber);
  const hasBank = Boolean(school?.bank_name && school?.bank_account_number);
  useEffect(() => { if (!hasMobile && hasBank) setMethod('bank'); else if (hasMobile) setMethod('mobile'); }, [hasMobile, hasBank]);

  return (
    <div className="payment-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="payment-modal glass-card" role="dialog" aria-modal="true" aria-labelledby="payment-title">
        <div className="payment-step">
          <h2 id="payment-title">Payment instructions</h2>
          <p className="payment-summary">For: <b>{payment.name || payment.reference}</b></p>
          <div className="payment-amount">{formatCurrency(payment.amount, school?.currency_code)}</div>
          <p>Use the school’s official payment channel, then share the transaction reference with the school office. The school administrator will confirm the payment in the portal.</p>
          <div className="method-selector" role="group" aria-label="Payment method">
            {hasMobile && <button type="button" className={`method-btn ${method === 'mobile' ? 'active' : ''}`} aria-pressed={method === 'mobile'} onClick={() => setMethod('mobile')}>{mobileProvider}</button>}
            {hasBank && <button type="button" className={`method-btn ${method === 'bank' ? 'active' : ''}`} aria-pressed={method === 'bank'} onClick={() => setMethod('bank')}>Bank transfer</button>}
          </div>
          <div className="payment-instructions glass-card" style={{ marginTop: 20, padding: 15, background: 'rgba(255,255,255,0.05)', fontSize: '0.9rem' }}>
            {method === 'mobile' && hasMobile ? (
              <>
                <p><b>{school?.name || 'School'} {mobileProvider} details</b></p>
                <p>Provider account: <b>{mobileNumber}</b></p>
                {school?.mobile_money_account_name && <p>Account name: <b>{school.mobile_money_account_name}</b></p>}
                <p>Payment reference: <b>{payment.reference || 'Ask the school office'}</b></p>
              </>
            ) : method === 'bank' && hasBank ? (
              <>
                <p><b>{school?.name || 'School'} bank details</b></p>
                <p>Bank: <b>{school?.bank_name || 'Contact the school office'}</b></p>
                <p>Account name: <b>{school?.bank_account_name || school?.name || 'Contact the school office'}</b></p>
                <p>Account number: <b>{school?.bank_account_number || 'Contact the school office'}</b></p>
              </>
            ) : <p>Contact {school?.name || 'the school office'} for verified local payment details.</p>}
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
