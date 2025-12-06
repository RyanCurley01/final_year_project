import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public class GeneratePasswordHash {
    public static void main(String[] args) {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        String password = "password123";
        String hash = encoder.encode(password);
        System.out.println("===========================================");
        System.out.println("NEW BCRYPT HASH: " + hash);
        System.out.println("===========================================");
        System.out.println("Verification test: " + encoder.matches(password, hash));
    }
}
