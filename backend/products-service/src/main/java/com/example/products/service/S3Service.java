package com.example.products.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

@Service
public class S3Service {

    private static final Duration URL_EXPIRATION = Duration.ofHours(1); // URLs valid for 1 hour

    @Value("${aws.s3.bucket-name}")
    private String bucketName;

    @Value("${aws.region}")
    private String region;

    @Value("${aws.access-key-id}")
    private String accessKeyId;

    @Value("${aws.secret-access-key}")
    private String secretAccessKey;

    private S3Presigner presigner;

    private S3Presigner getPresigner() {
        if (presigner == null) {
            try {
                AwsBasicCredentials awsCredentials = AwsBasicCredentials.create(accessKeyId, secretAccessKey);
                
                presigner = S3Presigner.builder()
                        .region(Region.of(region))
                        .credentialsProvider(StaticCredentialsProvider.create(awsCredentials))
                        .build();
            } catch (Exception e) {
                System.err.println("Failed to initialize S3 Presigner: " + e.getMessage());
                return null;
            }
        }
        return presigner;
    }

    /**
     * Generates a presigned URL for an S3 object
     * @param s3Url The full S3 URL (e.g., https://bucket.s3.region.amazonaws.com/key)
     * @return Presigned URL that allows temporary access to the object
     */
    public String generatePresignedUrl(String s3Url) {
        if (s3Url == null || s3Url.isEmpty()) {
            return null;
        }

        try {
            S3Presigner presignerInstance = getPresigner();
            if (presignerInstance == null) {
                return s3Url; // Return original URL if presigner failed to initialize
            }

            // Extract the key from the S3 URL
            String key = extractKeyFromUrl(s3Url);
            
            if (key == null) {
                System.err.println("Failed to extract key from URL: " + s3Url);
                return s3Url; // Return original if we can't parse it
            }

            System.out.println("Generating presigned URL for key: " + key + " (from URL: " + s3Url + ")");

            GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                    .bucket(bucketName)
                    .key(key)
                    .build();

            GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                    .signatureDuration(URL_EXPIRATION)
                    .getObjectRequest(getObjectRequest)
                    .build();

            PresignedGetObjectRequest presignedRequest = presignerInstance.presignGetObject(presignRequest);
            
            return presignedRequest.url().toString();
        } catch (Exception e) {
            // Log the error and return the original URL as fallback
            System.err.println("Error generating presigned URL: " + e.getMessage());
            return s3Url;
        }
    }

    /**
     * Extracts the S3 object key from a full S3 URL
     * Example: https://bucket.s3.region.amazonaws.com/folder/file.png -> folder/file.png
     */
    private String extractKeyFromUrl(String s3Url) {
        try {
            // Handle both formats:
            // https://bucket.s3.region.amazonaws.com/key
            // https://bucket.s3.amazonaws.com/key
            String[] parts = s3Url.split(bucketName + ".s3");
            if (parts.length < 2) {
                return null;
            }
            
            // Get everything after ".amazonaws.com/"
            String afterDomain = parts[1];
            int startIndex = afterDomain.indexOf('/');
            if (startIndex == -1) {
                return null;
            }
            
            String key = afterDomain.substring(startIndex + 1);
            
            // URL decode the key since the database stores URL-encoded paths
            // The actual S3 object keys have literal apostrophes and spaces
            // e.g., database has "Ted%27s%20Energy.wav", S3 object is "Ted's Energy.wav"
            try {
                key = URLDecoder.decode(key, StandardCharsets.UTF_8.toString());
            } catch (Exception e) {
                // If decoding fails, use the key as-is
                System.err.println("Failed to decode key: " + e.getMessage());
            }
            
            return key;
        } catch (Exception e) {
            return null;
        }
    }

    public void close() {
        if (presigner != null) {
            presigner.close();
        }
    }
}
