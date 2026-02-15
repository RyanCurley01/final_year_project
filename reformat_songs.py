
import re

input_file = '/workspaces/final_year_project/scripts/database/songs_insert.sql'
output_file = '/workspaces/final_year_project/scripts/database/songs_insert_reformatted.sql'

# Regex to capture the values from the multi-line INSERT
# Assumes format: (col1, col2, ...)
# The existing file has 10 columns.
# (NULL, 'Alien Acid', NULL, NULL, 0.5, 'url1', NULL, 'url2', 'url3', 200)
# We want to extract:
# Title (index 1), Price (4), Cover (5), File (7), Preview (8), Stock (9)
# Note: indexes are 0-based.
# Wait, let's verify positions.
# INSERT INTO `Products` (`GameTitle`, `AlbumTitle`, `Platform`, `GamePrice`, `AlbumPrice`, `albumCoverImageUrl`, `gameCoverImageUrl`, `file_url`, `preview_url`, `StockQuantity`)
# 0: GameTitle (NULL)
# 1: AlbumTitle
# 2: Platform (NULL)
# 3: GamePrice (NULL)
# 4: AlbumPrice (0.5)
# 5: albumCoverImageUrl
# 6: gameCoverImageUrl (NULL)
# 7: file_url
# 8: preview_url
# 9: StockQuantity

# We want output columns:
# ProductID, AlbumTitle, AlbumPrice, albumCoverImageUrl, file_url, preview_url, StockQuantity
# Values:
# NULL, [1], [4], [5], [7], [8], [9]

pattern = r"\(\s*NULL,\s*'([^']+)',\s*NULL,\s*NULL,\s*([\d\.]+),\s*'([^']+)',\s*NULL,\s*'([^']+)',\s*'([^']+)',\s*(\d+)\)"
# Note: The smart quotes in 'Ted’s' might not match '([^']+)' if the file uses smart quotes inside strings delimited by straight quotes.
# Actually, the file uses straight quotes as delimiters: 'Ted’s Awakening'. The inside is a smart quote. My regex `[^']+` will match it because it's not a straight single quote.
# BUT, we need to handle the smart quote char `’` -> `\'` transformation.

lines = []
with open(input_file, 'r') as f:
    content = f.read()

# We can split by line or just find all matches in the block
# Using findall might be safer.
matches = re.findall(pattern, content)

print(f"Found {len(matches)} matches")

new_lines = []
for m in matches:
    title = m[0]
    price = m[1]
    cover = m[2]
    file_url = m[3]
    prev_url = m[4]
    stock = m[5]

    # Transform title: replace smart quote with escaped straight quote
    title = title.replace("’", "\\'")
    # Also double check for straight apostrophes inside valid strings if any (e.g. "Ted's" -> "Ted\'s")
    # But current file uses smart quotes, so maybe no straight quotes inside.

    # Format line:
    # INSERT INTO `Products` (`ProductID`, `AlbumTitle`, `AlbumPrice`, `albumCoverImageUrl`, `file_url`, `preview_url`, `StockQuantity`) VALUES (NULL,'Title',0.50,'url','url','url',200);
    # Note: price in match is likely '0.5'. init-script uses '0.50'. I can force format.
    
    try:
        price_float = float(price)
        price_str = f"{price_float:.2f}"
    except:
        price_str = price

    line = f"INSERT INTO `Products` (`ProductID`, `AlbumTitle`, `AlbumPrice`, `albumCoverImageUrl`, `file_url`, `preview_url`, `StockQuantity`) VALUES (NULL,'{title}',{price_str},'{cover}','{file_url}','{prev_url}',{stock});"
    new_lines.append(line)

with open(output_file, 'w') as f:
    f.write("\n".join(new_lines))
    f.write("\n")

print("Done")
