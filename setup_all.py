#!/usr/bin/env python3
"""
Master setup script for the entire Game and Music Store system
Configures AI service, backend services, and frontend for current environment
"""

import os
import subprocess
import sys

def run_setup_script(directory, script_name, description):
    """Run a setup script in a specific directory"""
    
    print(f"\n🔧 {description}")
    print("=" * 50)
    
    if not os.path.exists(directory):
        print(f"❌ Directory {directory} not found")
        return False
    
    script_path = os.path.join(directory, script_name)
    if not os.path.exists(script_path):
        print(f"❌ Setup script {script_path} not found")
        return False
    
    try:
        # Change to the directory and run the script
        original_cwd = os.getcwd()
        os.chdir(directory)
        
        if script_name.endswith('.py'):
            result = subprocess.run([sys.executable, script_name], capture_output=True, text=True)
        else:
            result = subprocess.run(['bash', script_name], capture_output=True, text=True)
        
        # Print output
        if result.stdout:
            print(result.stdout)
        if result.stderr:
            print(f"⚠️  Warnings/Errors: {result.stderr}")
        
        os.chdir(original_cwd)
        
        if result.returncode == 0:
            print(f"✅ {description} completed successfully!")
            return True
        else:
            print(f"❌ {description} failed with return code {result.returncode}")
            return False
            
    except Exception as e:
        os.chdir(original_cwd)
        print(f"❌ Error running {description}: {e}")
        return False

def detect_environment():
    """Detect current environment"""
    
    is_codespaces = os.getenv('CODESPACES') == 'true'
    codespace_name = os.getenv('CODESPACE_NAME')
    
    print("🌍 Environment Detection")
    print("=" * 50)
    
    if is_codespaces and codespace_name:
        print(f"🚀 GitHub Codespaces: {codespace_name}")
        print(f"📍 Domain: {os.getenv('GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN', 'preview.app.github.dev')}")
    else:
        print("🏠 Local Development Environment")
    
    return is_codespaces, codespace_name

def main():
    """Main setup function"""
    
    print("🎮 Game and Music Store - Environment Setup")
    print("=" * 60)
    print("This script will configure all services for your current environment")
    
    # Detect environment
    is_codespaces, codespace_name = detect_environment()
    
    # Setup each component
    results = []
    
    # 1. Setup AI Service
    results.append(run_setup_script(
        'ai_service', 
        'setup_env.py',
        'Setting up AI Recommendation Service'
    ))
    
    # 2. Setup Backend Services
    results.append(run_setup_script(
        'backend',
        'setup_backend_env.py',
        'Setting up Backend Spring Boot Services'
    ))
    
    # 3. Setup Frontend
    results.append(run_setup_script(
        'frontend',
        'setup_frontend_env.py',
        'Setting up Frontend React Application'
    ))
    
    # Summary
    print(f"\n📊 Setup Summary")
    print("=" * 50)
    
    components = ['AI Service', 'Backend Services', 'Frontend']
    for i, (component, success) in enumerate(zip(components, results)):
        status = "✅ Success" if success else "❌ Failed"
        print(f"  {component}: {status}")
    
    successful_setups = sum(results)
    
    if successful_setups == len(results):
        print(f"\n🎉 All components configured successfully!")
        
        print(f"\n🚀 Next Steps:")
        if is_codespaces:
            print(f"  🌐 Your services will be available at:")
            print(f"    • AI Service: https://{codespace_name}-5000.preview.app.github.dev")
            print(f"    • Backend: https://{codespace_name}-8080.preview.app.github.dev") 
            print(f"    • Frontend: https://{codespace_name}-5173.preview.app.github.dev")
        else:
            print(f"  🌐 Your services will be available at:")
            print(f"    • AI Service: http://localhost:5000")
            print(f"    • Backend: http://localhost:8080")
            print(f"    • Frontend: http://localhost:5173")
        
        print(f"\n  🔧 To start services:")
        print(f"    • AI Service: cd ai_service && python main.py")
        print(f"    • Backend: cd backend && ./gradlew bootRun")
        print(f"    • Frontend: cd frontend && npm run dev")
        
    else:
        print(f"\n⚠️  {len(results) - successful_setups} component(s) failed to configure.")
        print(f"Please check the error messages above and try running the individual setup scripts.")
    
    return successful_setups == len(results)

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
