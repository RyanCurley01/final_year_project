# audio_service/utils.py

# EXECUTION ORDER: Independent. Can be imported anywhere.
class Console:
    """
    Helper class to support console.log syntax similar to JavaScript.
    Useful for consistent logging across the application.
    """
    def log(self, *args, **kwargs):
        print(*args, **kwargs)

console = Console()
