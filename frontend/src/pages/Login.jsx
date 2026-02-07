import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Login() {
  const emailRef = useRef();
  const passwordRef = useRef();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();

    try {
      setError('');
      setLoading(true);
      const userCredential = await login(emailRef.current.value, passwordRef.current.value);
      const user = userCredential.user;
      const token = await user.getIdToken();

      // Sync/Login with backend
      await axios.post('http://localhost:8080/api/accounts/firebase-login', {
        token,
        email: user.email,
        uid: user.uid
      });

      navigate('/'); // Redirect to home after login
    } catch (err) {
      console.error(err);
      setError('Failed to log in');
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
