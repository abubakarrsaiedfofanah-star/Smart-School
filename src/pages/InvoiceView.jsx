import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
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

        if (paymentId.startsWith('PAY-DEMO') || !supabase) {
          setData({
            payment: { reference: paymentId, amount: 25000, status: 'paid', paid_at: new Date().toISOString() },
            fee: { name: 'Term 2 Tuition' },
            student: { admission_number: 'ST001', profiles: { full_name: 'Amina Hassan' }, classes: { name: 'Grade 7A' } },
            school: { name: 'Bright Future Academy', address: '456 Innovation Blvd, Electric City', logo_url: '' }
          });
          setLoading(false);
          return;
        }

        const { data: pay, error } = await supabase
          .from('payments')
          .select('*, fees(*), students(*, profiles(full_name), classes(name)), schools(*)')
          .eq('id', paymentId)
          .single();

        if (error) throw error;
        setData({
          payment: pay,
          fee: pay.fees,
          student: pay.students,
          school: pay.schools
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

  const { payment, fee, student, school } = data;

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
            <h1>INVOICE</h1>
            <p>Invoice #: {payment.reference}</p>
            <p>Date: {new Date(payment.paid_at || Date.now()).toLocaleDateString()}</p>
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
              <td className="right">KES {payment.amount?.toLocaleString()}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td><b>Total Amount Due</b></td>
              <td className="right"><b>KES {payment.amount?.toLocaleString()}</b></td>
            </tr>
          </tfoot>
        </table>

        <footer className="invoice-footer">
          <div className="instructions">
            <h4>Payment Instructions</h4>
            <p>Please use the Reference Number <b>{payment.reference}</b> for all payments.</p>
            <div style={{fontSize: '0.8rem', marginTop: '10px'}}>
              {school.mpesa_paybill && <p>M-Pesa Paybill: <b>{school.mpesa_paybill}</b></p>}
              {school.bank_account_number && (
                <p>Bank: <b>{school.bank_name}</b> | A/C: <b>{school.bank_account_number}</b></p>
              )}
            </div>
          </div>
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
