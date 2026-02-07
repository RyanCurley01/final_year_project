
import re

def read_file(path):
    with open(path, 'r') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)

def main():
    # 1. Read source data
    products_sql = read_file('products_data.sql')
    audio_features_sql = read_file('audio_features_data.sql')
    
    # Extract Product IDs to generate Stock and fix Orders
    # Matches: VALUES (-1749388903, ...
    product_ids = re.findall(r'VALUES\s*\((-?\d+),', products_sql)
    
    if not product_ids:
        print("Error: No product IDs found in products_data.sql")
        # Fallback to a wider regex if needed, but the previous read showed VALUES (-1749...)
        # Let's try to include spaces
        product_ids = re.findall(r'VALUES\s*\(\s*(-?\d+)\s*,', products_sql)
        
    print(f"Found {len(product_ids)} products.")
    first_product_id = product_ids[0] if product_ids else '1'

    # Generate Stock Inserts
    stock_inserts = ["-- Insert Stock for new products"]
    stock_inserts.append("INSERT INTO Stock (ProductID, Quantity) VALUES")
    stock_values = []
    for pid in product_ids:
        stock_values.append(f"({pid}, 100)")
    stock_inserts.append(",\n".join(stock_values) + ";")
    stock_block = "\n".join(stock_inserts)

    # 2. Process init-database.sh
    init_db_content = read_file('deployment/init-database.sh')
    
    # We need to construct the new file content section by section
    # The file has a structure: header -> Products -> Stock -> Customers -> ... -> AudioFeatures -> footer
    
    # Split before Products
    part1 = init_db_content.split('-- Insert Products')[0]
    
    # Find where the next section starts after products. 
    # In the original file, it goes Products -> Stock -> Customers.
    # We can split by '-- Insert Stock'
    remaining_after_products = init_db_content.split('-- Insert Stock', 1)[1]
    
    # Split remaining_after_products at '-- Insert Customers' to remove old Stock
    part_customers_and_rest = remaining_after_products.split('-- Insert Customers', 1)[1]
    
    # Now we have:
    # part1: Header
    # [Insert valid Products]
    # [Insert generated Stock]
    # part_customers_and_rest: Customers -> Orders -> ... -> AudioFeatures -> Footer
    
    # In part_customers_and_rest, we need to:
    # a) Replace references to old ProductIDs (e.g. 5) with new basic ID (first_product_id)
    # The dummy data uses product ID 5 for the order examples.
    # We will simply string replace "ProductID, ...) VALUES ..., 5, ..." patterns or just blunt replace for the specific know dummy usage.
    # Looking at the file: "(1, 5, 1, 5.00)" is in Order_Items. 
    # "(8, 5, 1)" is in CustomerSummary.
    # "(1, 5)" is in Sold_Products.
    # "(8, 5)" is in Wishlist.
    # It seems safe to replace ", 5)" with ", " + first_product_id + ")" 
    # and ", 5," with ", " + first_product_id + "," in that section.
    # But be careful not to replace other 5s. 
    
    # Let's use regex for specific replacements in that block to be safe.
    # Replace (1, 5) -> (1, NEW_ID)
    # Replace (8, 5) -> (8, NEW_ID)
    # Replace (1, 5, -> (1, NEW_ID,
    
    fixed_rest = part_customers_and_rest
    fixed_rest = fixed_rest.replace('(1, 5)', f'(1, {first_product_id})')
    fixed_rest = fixed_rest.replace('(8, 5)', f'(8, {first_product_id})')
    fixed_rest = fixed_rest.replace('(1, 5,', f'(1, {first_product_id},')
    
    # Use generic AudioFeatures marker
    if '-- Insert AudioFeatures' in fixed_rest:
        before_audio, after_audio_start = fixed_rest.split('-- Insert AudioFeatures', 1)
        # Find end of AudioFeatures block. It ends with a semicolon and blank lines before "GRANT ALL" or EOF
        # In the provided snippet, it ended with ...22682666778564453]');"
        # Then next is "-- Grant privileges"
        
        if '-- Grant privileges' in after_audio_start:
             _, footer = after_audio_start.split('-- Grant privileges', 1)
             footer = '-- Grant privileges' + footer
        else:
            # Fallback for railway-init.sql if different or if GRANT is missing (unlikely in init-database.sh)
            # Find the last semicolon of the block
            footer = after_audio_start.split(';', 1)[1] # This is risky if there are multiple inserts
            # Actually, standardizing on finding the next section or EOSQL is safer.
            pass

        # Robust extraction of footer from init-database.sh which ends with EOSQL
        # The file content provided showed:
        # ...
        # (52, ...);
        #
        #    -- Grant privileges ...
        #    EOSQL
        
        # Let's just look for "-- Grant privileges" as the anchor for the end of AudioFeatures
        split_marker = "-- Grant privileges"
        if split_marker in fixed_rest:
            pre_audio_section = fixed_rest.split('-- Insert AudioFeatures')[0]
            post_audio_section = fixed_rest.split(split_marker)[1]
            
            new_init_db = (
                part1 + 
                "-- Insert Products\n" + 
                products_sql + "\n\n" + 
                stock_block + "\n\n" + 
                "-- Insert Customers" + 
                pre_audio_section + 
                "-- Insert AudioFeatures for music products\n" + 
                audio_features_sql + "\n\n" + 
                "    " + split_marker + post_audio_section
            )
            
            write_file('deployment/init-database.sh', new_init_db)
            print("Updated deployment/init-database.sh")
            
            
    # 3. Process railway-init.sql
    # Structure is very similar but without EOSQL wrapper usually? 
    # Let's read it to be sure.
    railway_content = read_file('deployment/railway-init.sql')
    
    # Logic should be identical if the structure matches.
    # Part 1: Before products
    part1_r = railway_content.split('-- Insert Products')[0]
    
    remaining_r = railway_content.split('-- Insert Stock', 1)[1]
    part_rest_r = remaining_r.split('-- Insert Customers', 1)[1]
    
    fixed_rest_r = part_rest_r
    fixed_rest_r = fixed_rest_r.replace('(1, 5)', f'(1, {first_product_id})')
    fixed_rest_r = fixed_rest_r.replace('(8, 5)', f'(8, {first_product_id})')
    fixed_rest_r = fixed_rest_r.replace('(1, 5,', f'(1, {first_product_id},')

    if '-- Insert AudioFeatures' in fixed_rest_r and '-- Grant privileges' in fixed_rest_r:
        pre_audio_r = fixed_rest_r.split('-- Insert AudioFeatures')[0]
        post_audio_r = fixed_rest_r.split('-- Grant privileges')[1]
        
        new_railway = (
            part1_r + 
            "-- Insert Products\n" + 
            products_sql + "\n\n" + 
            stock_block + "\n\n" + 
            "-- Insert Customers" + 
            pre_audio_r + 
            "-- Insert AudioFeatures for music products\n" + 
            audio_features_sql + "\n\n" + 
            "-- Grant privileges" + post_audio_r
        )
        
        write_file('deployment/railway-init.sql', new_railway)
        print("Updated deployment/railway-init.sql")
    else:
        print("Could not find delimiters in railway-init.sql")

if __name__ == '__main__':
    main()
