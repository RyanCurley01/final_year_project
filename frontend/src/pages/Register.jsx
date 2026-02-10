import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { accountService } from '../redux/services';
import { FcGoogle } from "react-icons/fc";

export default function Register() {
  const emailRef = useRef();
  const passwordRef = useRef();
  const passwordConfirmRef = useRef();
  const nameRef = useRef();
  const phoneRef = useRef();
  const { signup, login, loginWithGoogle, syncWithBackend, setUser } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleGoogleRegister() {
    try {
      setError("");
      setLoading(true);

      console.log("DEBUG: Starting Google Popup Register...");
      const result = await loginWithGoogle();
      
      if (result && result.user) {
          // Sync with backend (will create account if not exists)
          await syncWithBackend(result.user);
          console.log("DEBUG: Backend sync complete, navigating to home");
          navigate("/");
      }
    } catch (err) {
      console.error("Google register failed", err);
      if (err.code === 'auth/popup-closed-by-user') {
          setError("Sign in cancelled");
      } else if (err.message && err.message.includes("Cross-Origin-Opener-Policy")) {
          setError("Browser security policy blocked the popup. Please try again.");
      } else {
          setError("Failed to register with Google: " + err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (passwordRef.current.value !== passwordConfirmRef.current.value) {
      return setError('Passwords do not match');
    }

    try {
      setError('');
      setLoading(true);
      // 1. Create user in Firebase or identify existing
      let user;
      try {
        const userCredential = await signup(emailRef.current.value, passwordRef.current.value);
        user = userCredential.user;
      } catch (signupErr) {
        if (signupErr.code === 'auth/email-already-in-use') {
          // If already in Firebase, try to sign in to verify and sync
          console.log("Email already in use, attempting to login and sync...");
          const userCredential = await login(emailRef.current.value, passwordRef.current.value);
          user = userCredential.user;
        } else {
          throw signupErr;
        }
      }

      const token = await user.getIdToken();
      console.log("DEBUG (Register): Obtained Firebase Token:", token ? `${token.substring(0, 20)}...[truncated]` : "null");
      console.log("DEBUG (Register): User:", user.uid, user.email);
      
      // 2. Sync with backend
      const phoneNumber = phoneRef.current.value || "";
      console.log("DEBUG (Register): Syncing with backend...", { name: nameRef.current.value, phoneNumber });
      
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

        <div className="flex items-center justify-between my-4">
          <span className="w-1/5 border-b border-gray-600 lg:w-1/4"></span>
          <span className="text-xs text-center text-gray-400 uppercase">or</span>
          <span className="w-1/5 border-b border-gray-600 lg:w-1/4"></span>
        </div>

        <button
            disabled={loading}
            onClick={handleGoogleRegister}
            className="w-full flex items-center justify-center py-2 font-bold text-gray-900 bg-white rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
          >
            <FcGoogle className="mr-2 text-2xl" />
            Sign up with Google
        </button>

        <div className="text-center mt-4">
          Already have an account? <Link to="/login" className="text-cyan-400 hover:text-cyan-300">Log In</Link>
        </div>
      </div>
    </div>
  );
}
