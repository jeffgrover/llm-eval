import re

with open('sim.js', 'r') as f:
    text = f.read()

# I will just write a python script to replace the broken string concatenations.
# Wait, it's easier to just use `write_file` or replace the updateHUD function completely.
