import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';
import logo from '../assets/logoh.png';
import illustration from '../assets/login_illustration_new.jpg';
import { InstallButton } from '../components/InstallButton';



export function Login() {
  const { login, currentUser, loading } = useAuth();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigatingRef = useRef(false);

  useEffect(() => {
    if (currentUser && !navigatingRef.current) {
      navigate('/', { replace: true });
    }
    return () => { navigatingRef.current = false; };
  }, [currentUser, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email && pin) {
      setError('');
      setIsSubmitting(true);
      try {
        const result = await login(email.trim().toLowerCase(), pin.trim());
        if (result.success) {
          navigate('/', { replace: true });
        } else {
          setError(result.error || 'Identifiants ou code PIN incorrects.');
          setPin('');
        }
      } catch (err: any) {
        setError(err?.message || 'Une erreur est survenue lors de la connexion.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };



  if (loading && !currentUser) {
    return (
      <div className="login-container">
        <div className="login-header">
          <h2 style={{ color: 'var(--color-primary)' }}>HINOV BUSINESS SUITE</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-illustration">
        <img src={illustration} alt="Gestion des devis" />
        <div className="illustration-overlay">
          <h2>Hinov Business Suite</h2>
          <p>La solution complète de gestion : ERP, CRM, et Caisse Connectée.</p>
        </div>
      </div>
      
      <div className="login-form-container">
        <div className="login-card">
          <div className="login-header">
            <div className="login-logo">
              <img src={logo} alt="Hinov" />
            </div>
            <h2 className="animated-title">Hinov Business Suite</h2>
            <p>Connectez-vous à votre espace</p>
          </div>

        {error && (
          <div className="login-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Adresse e-mail</label>
            <input 
              type="email" 
              className="login-input" 
              placeholder="Ex: jean.dupont@hinov.com" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              required 
            />
          </div>
          
          <div className="form-group">
            <label>Code PIN / Mot de passe</label>
            <input 
              type="password" 
              className="login-input" 
              placeholder="******" 
              value={pin}
              onChange={e => setPin(e.target.value)}
              required 
            />
          </div>

          <button type="submit" className="btn btn-primary login-btn" disabled={isSubmitting}>
            {isSubmitting ? 'Connexion en cours...' : 'Se connecter'}
          </button>
          
          <InstallButton />

          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <a
              href="/#/catalogue"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--color-primary)',
                fontSize: '13px',
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              <span>🛍️ Consulter le Catalogue Public</span>
            </a>
          </div>
        </form>
      </div>
      
      </div>
    </div>
  );
}
