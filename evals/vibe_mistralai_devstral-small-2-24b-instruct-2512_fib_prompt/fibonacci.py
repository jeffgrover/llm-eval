#!/usr/bin/env python3
"""
A simple command-line program that prints the first N Fibonacci numbers.
"""

def generate_fibonacci(n):
    """Generate the first n Fibonacci numbers."""
    if n <= 0:
        return []
    elif n == 1:
        return [0]
    elif n == 2:
        return [0, 1]
    
    fib_sequence = [0, 1]
    for i in range(2, n):
        next_num = fib_sequence[-1] + fib_sequence[-2]
        fib_sequence.append(next_num)
    
    return fib_sequence

def main():
    import sys
    
    # Default to 100 if no argument is provided
    try:
        n = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    except ValueError:
        print("Error: Please provide a valid integer for N.")
        sys.exit(1)
    
    fib_sequence = generate_fibonacci(n)
    print(','.join(map(str, fib_sequence)))

if __name__ == "__main__":
    main()