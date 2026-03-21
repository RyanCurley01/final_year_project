import re

def update_file(filepath, replacements):
    with open(filepath, 'r') as f:
        content = f.read()
    
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)
        else:
            print(f"Warning: could not find segment in {filepath}")
            
    with open(filepath, 'w') as f:
        f.write(content)

# REGISTER.JSX
register_reps = [
    (
        "export default function Register() {",
        "// Declares and exports the Register functional React component so it can be imported and used in your router configuration.\nexport default function Register() {"
    ),
    (
        "  const emailRef = useRef();",
        "  // Creates references attached to the form inputs allowing direct reads bypassing state.\n  const emailRef = useRef();"
    ),
    (
        "  const { signup, login, loginWithGoogle, syncWithBackend, setUser } = useAuth();",
        "  // Destructures and grabs necessary authentication utilities from your custom AuthContext.\n  const { signup, login, loginWithGoogle, syncWithBackend, setUser } = useAuth();"
    ),
    (
        "  const [error, setError] = useState('');\n  const [loading, setLoading] = useState(false);",
        "  // Initializes standard state variables managing visual UI error strings and loading form lockdown arrays.\n  const [error, setError] = useState('');\n  const [loading, setLoading] = useState(false);"
    ),
    (
        "  async function handleGoogleRegister() {",
        "  // An asynchronous function triggered when the user clicks 'Sign up with Google'.\n  async function handleGoogleRegister() {"
    ),
    (
        "      const result = await loginWithGoogle();",
        "      // Calls the Firebase Google SSO popup method. Halts here until user authorizes the Google popup.\n      const result = await loginWithGoogle();"
    ),
    (
        "          await syncWithBackend(result.user);",
        "          // Sends the newly created Firebase user object back to the Spring Boot backend to record the Accounts table row.\n          await syncWithBackend(result.user);"
    ),
    (
        "  async function handleSubmit(e) {",
        "  // Triggered when standard HTML form is submitted, halting default page reloads.\n  async function handleSubmit(e) {"
    ),
    (
        "    if (passwordRef.current.value !== passwordConfirmRef.current.value) {",
        "    // Validation check: Ensures the user typed the exact same string in Password and Password Confirmation.\n    if (passwordRef.current.value !== passwordConfirmRef.current.value) {"
    ),
    (
        "        const userCredential = await signup(emailRef.current.value, passwordRef.current.value);",
        "        // Inner try block explicitly executing Firebase createUserWithEmailAndPassword mapped internally natively.\n        const userCredential = await signup(emailRef.current.value, passwordRef.current.value);"
    ),
    (
        "      const token = await user.getIdToken();",
        "      // Requests a secure, digitally signed JWT from Firebase required by the backend to prove cryptographic authenticity.\n      const token = await user.getIdToken();"
    ),
    (
        "      const backendUser = await accountService.firebaseLogin(token, user.email, user.uid, nameRef.current.value, phoneNumber);",
        "      // Sends the retrieved Firebase Token, Email, and Name to the Spring Boot microservice to create the MySQL row locally.\n      const backendUser = await accountService.firebaseLogin(token, user.email, user.uid, nameRef.current.value, phoneNumber);"
    ),
    (
        "      setUser({",
        "      // Updates the global React Context and localStorage bridging the SQL returned user with FirebaseUID mapping.\n      setUser({"
    ),
]

# LOGIN.JSX
login_reps = [
    (
        "export default function Login() {",
        "// Main component acting as the entry point checking Firebase vs Spring Boot hybrid authentication trees.\nexport default function Login() {"
    ),
    (
        "  async function handleSubmit(e) {",
        "  // Catches form submits preventing standard page rebuilds and tracking raw input references natively.\n  async function handleSubmit(e) {"
    ),
    (
        "        const userCredential = await login(email, password);",
        "        // Pings Firebase endpoints securely attempting to pull sign within standard signInWithEmailAndPassword constraints natively.\n        const userCredential = await login(email, password);"
    )
]

update_file("src/pages/Register.jsx", register_reps)
update_file("src/pages/Login.jsx", login_reps)

