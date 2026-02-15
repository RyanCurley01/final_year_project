import os
from dotenv import load_dotenv

load_dotenv('.env.docker')
if not os.getenv('AWS_ACCESS_KEY_ID'):
    load_dotenv()

def resolve_placeholder(value):
    if not isinstance(value, str):
        return value
    if value.startswith('${') and value.endswith('}'):
        content = value[2:-1]
        if ':' in content:
            var_name, default_val = content.split(':', 1)
            return os.getenv(var_name, default_val)
        else:
            return os.getenv(content, value)
    return value

print(f"AWS_ACCESS_KEY_ID='{resolve_placeholder('${AWS_ACCESS_KEY_ID}')}'")
print(f"AWS_REGION='{resolve_placeholder('${AWS_REGION:eu-west-1}')}'")
