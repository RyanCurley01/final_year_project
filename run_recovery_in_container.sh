#!/bin/bash
docker cp recover_image_generation.py gamestore_services-audio-service-1:/app/recover_image_generation.py
docker exec -it gamestore_services-audio-service-1 bash -c "pip install boto3 pymysql && python recover_image_generation.py"
