import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { accountService } from '../redux/services';

export default function Login() {
  const emailRef = useRef();
  const passwordRef = useRef();
  const { login, setUser } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const email = emailRef.current.value;
    const password = passwordRef.current.value;

    try {
      // 1. Try Firebase Login
      const userCredential = await login(email, password);
      const user = userCredential.user;
      const token = await user.getIdToken();
      console.log("DEBUG (Login): Obtained Firebase Token:", token ? `${token.substring(0, 20)}...[truncated]` : "null");

      // 2. Sync/Login with backend
      console.log("DEBUG (Login): Calling accountService.firebaseLogin");
      const backendUser = await accountService.firebaseLogin(token, user.email, user.uid);
      
      // 3. Store user details
      // Combine backend data with Firebase UID for consistent identity checks
      setUser({
        ...backendUser,
        firebaseUid: user.uid
      });

      navigate('/');
    } catch (firebaseErr) {
      console.warn("Firebase login failed, attempting legacy login...", firebaseErr);
      
      try {
        // 4. Fallback to Legacy Backend Login
        const response = await accountService.login(email, password);
        
        if (response.success) {
          const legacyUser = {
            id: response.accountId,
            accountName: response.accountName,
            accountType: response.accountType,
            accountEmailAddress: response.email,
            // Legacy users have no firebaseUid
          };
          setUser(legacyUser);
          navigate('/');
        } else {
          setError(response.message || 'Failed to log in');
        }
      } catch (backendErr) {
        console.error("Backend login failed:", backendErr);
        
        let errorMessage = 'Failed to log in';
        if (backendErr.message && backendErr.message.includes('401')) {
             errorMessage = 'Invalid email or password';
        } else if (backendErr.message) {
             errorMessage = backendErr.message;
        }
        
        setError(errorMessage);
      }
    }
    
    setLoading(false);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
      <div className="w-full max-w-md p-8 space-y-6 bg-gray-900 rounded-lg shadow-md">
        <h2 className="text-3xl font-bold text-center">Log In</h2>
        {error && <div className="p-3 text-red-500 bg-red-100 rounded">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              type="email"
              ref={emailRef}
              required
              className="w-full px-4 py-2 mt-1 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Password</label>
            <input
              type="password"
              ref={passwordRef}
              required
              className="w-full px-4 py-2 mt-1 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <button
            disabled={loading}
            type="submit"
            className="w-full py-2 font-bold text-white bg-cyan-600 rounded hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            Log In
          </button>
        </form>
        <div className="text-center mt-4">
          Need an account? <Link to="/register" className="text-cyan-400 hover:text-cyan-300">Sign Up</Link>
        </div>
      </div>
    </div>
  );
}
