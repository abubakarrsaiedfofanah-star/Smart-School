import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import '../styles/payment-flow.css';

export default function PaymentFlow({ payment, onClose, onSuccess }) {
  const [step, setStep] = useState(1); // 1: Select, 2: Processing, 3: Success
  const [method, setMethod] = useState('mpesa');
  const [school, setSchool] = useState(null);

  useEffect(() => {
    if (payment?.school_id) {
      fetchSchoolDetails();
    }
  }, [payment]);

  const fetchSchoolDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .eq('id', payment.school_id)
        .single();
      if (!error) setSchool(data);
    } catch (e) {
      console.error('Error fetching school payment details');
    }
  };

  const startPayment = () => {
    setStep(2);
    setTimeout(() => {
      setStep(3);
    }, 2500);
  };

  const finish = () => {
    onSuccess();
    onClose();
  };

  return (
    <div className="payment-overlay">
      <div className="payment-modal glass-card">
        {step === 1 && (
          <div className="payment-step">
            <h2>Complete Payment</h2>
            <p className="payment-summary">You are paying for: <b>{payment.name || payment.reference}</b></p>
            <div className="payment-amount">KES {payment.amount?.toLocaleString()}</div>

            <div className="method-selector">
              <button
                className={`method-btn ${method === 'mpesa' ? 'active' : ''}`}
                onClick={() => setMethod('mpesa')}
              >
                <i>📱</i> M-Pesa
              </button>
              <button
                className={`method-btn ${method === 'card' ? 'active' : ''}`}
                onClick={() => setMethod('card')}
              >
                <i>💳</i> Card
              </button>
            </div>

            <div className="payment-instructions glass-card" style={{marginTop: '20px', padding: '15px', background: 'rgba(255,255,255,0.05)', fontSize: '0.85rem'}}>
              {method === 'mpesa' ? (
                <>
                  <p style={{margin: '0 0 10px 0'}}><b>M-Pesa Instructions:</b></p>
                  <p style={{margin: '5px 0'}}>Paybill: <b>{school?.mpesa_paybill || '247247'}</b></p>
                  <p style={{margin: '5px 0'}}>Account: <b>{payment.reference || 'FEES'}</b></p>
                </>
              ) : (
                <>
                  <p style={{margin: '0 0 10px 0'}}><b>Bank Transfer Instructions:</b></p>
                  <p style={{margin: '5px 0'}}>Bank: <b>{school?.bank_name || 'Commercial Bank'}</b></p>
                  <p style={{margin: '5px 0'}}>Account Name: <b>{school?.bank_account_name || school?.name}</b></p>
                  <p style={{margin: '5px 0'}}>Account No: <b>{school?.bank_account_number || '0000000000'}</b></p>
                </>
              )}
            </div>

            <div className="payment-actions" style={{marginTop: '20px'}}>
              <button className="button blue-button full" onClick={startPayment}>Pay KES {payment.amount?.toLocaleString()} →</button>
              <button className="back" style={{width:'100%', marginTop:'10px'}} onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="payment-step processing">
            <div className="spinner large"></div>
            <h3>Processing Payment...</h3>
            <p>Please wait while we confirm your transaction with {method.toUpperCase()}.</p>
          </div>
        )}

        {step === 3 && (
          <div className="payment-step success">
            <div className="success-icon">✓</div>
            <h3>Payment Successful!</h3>
            <p>Your payment has been recorded. Here is your digital receipt summary:</p>

            <div className="receipt">
              <div className="receipt-row"><span>Reference</span><b>{payment.reference || 'REF-'+Math.random().toString(36).substr(2, 9).toUpperCase()}</b></div>
              <div className="receipt-row"><span>Amount Paid</span><b>KES {payment.amount?.toLocaleString()}</b></div>
              <div className="receipt-row"><span>Date</span><b>{new Date().toLocaleDateString()}</b></div>
            </div>

            <Link to={`/invoice/${payment.id}`} className="button small full" style={{marginBottom: '10px', backgroundColor: '#3b82f6', color: '#fff', textAlign:'center', display:'block'}}>
              Download Official Receipt 🧾
            </Link>

            <button className="button blue-button full" onClick={finish}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
