
package com.example.accounts.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;

import jakarta.annotation.PostConstruct;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

@Configuration
public class FirebaseConfig {

    @PostConstruct
    public void initialize() {
        try {
            if (FirebaseApp.getApps().isEmpty()) {
                InputStream serviceAccount = null;

                // 1) Try environment variable (production / Railway)
                String firebaseJson = System.getenv("FIREBASE_SERVICE_ACCOUNT_JSON");
                if (firebaseJson != null && !firebaseJson.isBlank()) {
                    serviceAccount = new ByteArrayInputStream(firebaseJson.getBytes(StandardCharsets.UTF_8));
                    System.out.println("Firebase: Using credentials from FIREBASE_SERVICE_ACCOUNT_JSON env var");
                } else {
                    // 2) Fall back to classpath file (local development)
                    serviceAccount = new ClassPathResource("firebase-service-account.json").getInputStream();
                    System.out.println("Firebase: Using credentials from classpath file");
                }

                FirebaseOptions options = FirebaseOptions.builder()
                        .setCredentials(GoogleCredentials.fromStream(serviceAccount))
                        .build();

                FirebaseApp.initializeApp(options);
                System.out.println("Firebase Application Initialized Successfully");
            }
        } catch (IOException e) {
            System.err.println("Accounts Service: Firebase initialization failed (Google auth will be unavailable): " + e.getMessage());
            // Don't throw - allow service to start without Firebase
        }
    }
}
