import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { accountService } from '../redux/services';

export default function Register() {
  const emailRef = useRef();
  const passwordRef = useRef();
  const passwordConfirmRef = useRef();
  const nameRef = useRef();
  const phoneRef = useRef();
  const { signup, setUser } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();

    if (passwordRef.current.value !== passwordConfirmRef.current.value) {
      return setError('Passwords do not match');
    }

    try {
      setError('');
      setLoading(true);
      // 1. Create user in Firebase
      const userCredential = await signup(emailRef.current.value, passwordRef.current.value);
      const user = userCredential.user;
      const token = await user.getIdToken();
      
      // 2. Sync with backend
      const phoneNumber = phoneRef.current.value || "";
      const backendUser = await accountService.firebaseLogin(token, user.email, user.uid, nameRef.current.value, phoneNumber);
      
      // 3. Store user details
      setUser(backendUser);

      navigate('/');
    } catch (err) {
      console.error(err);
      setError('Failed to create an account: ' + (err.message || 'Unknown error'));
    }

    setLoading(false);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
      <div className="w-full max-w-md p-8 space-y-6 bg-gray-900 rounded-lg shadow-md">
        <h2 className="text-3xl font-bold text-center">Sign Up</h2>
        {error && <div className="p-3 text-red-500 bg-red-100 rounded">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Name</label>
            <input
              type="text"
              ref={nameRef}
              required
              className="w-full px-4 py-2 mt-1 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
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
            <label className="block text-sm font-medium">Phone Number (Optional)</label>
            <input
              type="tel"
              ref={phoneRef}
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
           <div>
            <label className="block text-sm font-medium">Password Confirmation</label>
            <input
              type="password"
              ref={passwordConfirmRef}
              required
              className="w-full px-4 py-2 mt-1 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <button
            disabled={loading}
            type="submit"
            className="w-full py-2 font-bold text-white bg-cyan-600 rounded hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            Sign Up
          </button>
        </form>
        <div className="text-center mt-4">
          Already have an account? <Link to="/login" className="text-cyan-400 hover:text-cyan-300">Log In</Link>
        </div>
      </div>
    </div>
  );
}
