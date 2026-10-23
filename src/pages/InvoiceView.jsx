import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { formatCurrency } from '../lib/formatters';
import '../styles/invoice.css';

export default function InvoiceView() {
  const { paymentId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!paymentId) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        if (!supabase) {
          setData(null)
          setLoading(false);
          return;
        }

        const { data: pay, error } = await supabase
          .from('payments')
          .select('*, fees(*), students(*, profiles(full_name), classes(name))')
          .eq('id', paymentId)
          .single();

        if (error) throw error;
        const { data: school, error: schoolError } = await supabase.rpc('get_my_payment_school_details', { p_payment_id: paymentId });
        if (schoolError) throw schoolError;
        if (!school) throw new Error('Payment is not available to this account.');
        const { data: signers, error: signerError } = await supabase.rpc('get_payment_document_signatures', { p_payment_id: paymentId });
        if (signerError) console.error('Could not load receipt signatures:', signerError.message);
        setData({
          payment: pay,
          fee: pay.fees,
          student: pay.students,
          school,
          signers: signers?.[0] || null
        });
      } catch (err) {
        toast.error('Failed to load invoice');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [paymentId]);

  if (loading) return <div className="portal-loading"><div className="spinner"></div></div>;
  if (!data) return <div className="error-state">Invoice not found.</div>;

  const { payment, fee, student, school, signers } = data;
  const isReceipt = payment.status === 'paid';

  return (
    <div className="invoice-page">
      <nav className="no-print invoice-nav">
        <Link to="/portal" className="back-btn">← Back to Portal</Link>
        <button className="button blue-button" onClick={() => window.print()}>Print Invoice 🖨️</button>
      </nav>

      <div className="invoice-document printable">
        <header className="invoice-header">
          <div className="school-info">
            {school.logo_url && <img src={school.logo_url} alt="Logo" className="invoice-logo" />}
            <h2>{school.name}</h2>
            <p>{school.address}</p>
          </div>
          <div className="invoice-meta">
            <h1>{isReceipt ? 'OFFICIAL RECEIPT' : 'INVOICE'}</h1>
            <p>{isReceipt ? 'Receipt' : 'Invoice'} #: {payment.receipt_number || payment.reference}</p>
            <p>Date: {new Date(payment.paid_at || payment.created_at || Date.now()).toLocaleDateString()}</p>
            <div className={`status-badge ${payment.status}`}>{payment.status.toUpperCase()}</div>
          </div>
        </header>

        <div className="invoice-billing">
          <div className="bill-to">
            <small>BILL TO:</small>
            <h3>{student.profiles?.full_name}</h3>
            <p>Adm No: {student.admission_number}</p>
            <p>Class: {student.classes?.name}</p>
          </div>
        </div>

        <table className="invoice-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{fee?.name || 'School Fees'}</td>
              <td className="right">{formatCurrency(payment.amount, school?.currency_code)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td><b>{isReceipt ? 'Amount Paid' : 'Total Amount Due'}</b></td>
              <td className="right"><b>{formatCurrency(payment.amount, school?.currency_code)}</b></td>
            </tr>
          </tfoot>
        </table>

        {isReceipt && <section className="invoice-signatures" aria-label="Receipt approvals">
          <div className="invoice-signature">
            {signers?.finance_officer_signature_url && <img src={signers.finance_officer_signature_url} alt="Finance officer digital signature" />}
            <span className="invoice-signature-line" />
            <b>{signers?.finance_officer_name || 'Finance officer'}</b>
            <small>{signers?.finance_officer_signature_url ? 'Finance officer · digital signature' : 'Finance officer · signature not saved'}</small>
          </div>
          <div className="invoice-signature">
            {signers?.principal_signature_url && <img src={signers.principal_signature_url} alt="Principal digital signature" />}
            <span className="invoice-signature-line" />
            <b>{signers?.principal_name || 'Principal'}</b>
            <small>{signers?.principal_signature_url ? 'Principal · digital signature' : 'Principal · signature not saved'}</small>
          </div>
        </section>}

        <footer className="invoice-footer">
          {!isReceipt && <div className="instructions">
            <h4>Payment Instructions</h4>
            <p>Please use the Reference Number <b>{payment.reference}</b> for all payments.</p>
            <div style={{fontSize: '0.8rem', marginTop: '10px'}}>
              {school.mpesa_paybill && <p>M-Pesa Paybill: <b>{school.mpesa_paybill}</b></p>}
              {school.bank_account_number && (
                <p>Bank: <b>{school.bank_name}</b> | A/C: <b>{school.bank_account_number}</b></p>
              )}
            </div>
          </div>}
          <div className="digital-stamp">
            <div className="stamp-circle">
              <span>OFFICIAL</span>
              <span>VERIFIED</span>
              <span>3.1</span>
            </div>
            <p>Digital Copy</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
