import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    companyName: '',
    adminName: '',
    email: '',
    password: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Registering:', formData);
    // Simulación de registro exitoso
    navigate('/dashboard');
  };

  return (
    <div className="login-page">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="glass-effect login-card"
        style={{ padding: '2.5rem', width: '100%', maxWidth: '480px' }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.85rem', fontWeight: '800', marginBottom: '0.5rem', color: 'var(--text-white)' }}>Crear Cuenta</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Registra tu empresa en RemoteGuardian
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                Empresa
              </label>
              <div style={{ position: 'relative' }}>
                <Building size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input 
                  type="text" 
                  placeholder="Nombre"
                  style={{
                    width: '100%',
                    padding: '10px 10px 10px 38px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    color: 'white',
                    outline: 'none',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                Admin
              </label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input 
                  type="text" 
                  placeholder="Tu nombre"
                  style={{
                    width: '100%',
                    padding: '10px 10px 10px 38px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    color: 'white',
                    outline: 'none',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              Correo Corporativo
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input 
                type="email" 
                placeholder="admin@empresa.com"
                style={{
                  width: '100%',
                  padding: '10px 10px 10px 38px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '8px',
                  color: 'white',
                  outline: 'none',
                  fontSize: '0.875rem'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              Contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input 
                type="password" 
                placeholder="Mínimo 8 caracteres"
                style={{
                  width: '100%',
                  padding: '10px 10px 10px 38px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '8px',
                  color: 'white',
                  outline: 'none',
                  fontSize: '0.875rem'
                }}
              />
            </div>
          </div>

          <button 
            type="submit"
            style={{
              width: '100%',
              padding: '14px',
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              border: 'none',
              borderRadius: '8px',
              color: '#040b14',
              fontWeight: '700',
              fontSize: '1rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '1rem'
            }}
          >
            Registrar Empresa <ArrowRight size={18} />
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          ¿Ya tienes cuenta? <Link to="/login" style={{ color: 'var(--accent-purple)', textDecoration: 'none', fontWeight: '600' }}>Inicia sesión</Link>
        </p>
      </motion.div>
    </div>
  );
};

export default Register;
