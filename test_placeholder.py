import os

def resolve_placeholder(value):
    """Resolve Spring Boot style placeholders ${VAR:default}"""
    if not isinstance(value, str):
        return value
    
    # Simple check for ${...}
    if value.startswith('${') and value.endswith('}'):
        content = value[2:-1]
        if ':' in content:
            var_name, default_val = content.split(':', 1)
            return os.getenv(var_name, default_val)
        else:
            return os.getenv(content, value)
    return value

print(f"AWS_ACCESS_KEY_ID='{resolve_placeholder('${AWS_ACCESS_KEY_ID}')}'")
