#!/usr/bin/env python3
"""
A simple command-line program that prints the first N Fibonacci numbers.
Defaults to printing 100 numbers if no parameter is specified.
"""

import argparse


def generate_fibonacci(n):
    """Generate the first n Fibonacci numbers."""
    fib_sequence = []
    a, b = 0, 1
    for _ in range(n):
        fib_sequence.append(str(a))
        a, b = b, a + b
    return fib_sequence


def main():
    # Set up argument parser
    parser = argparse.ArgumentParser(
        description='Print the first N Fibonacci numbers.'
    )
    parser.add_argument(
        'n',
        type=int,
        nargs='?',
        default=100,
        help='Number of Fibonacci numbers to print (default: 100)'
    )
    
    args = parser.parse_args()
    
    # Validate the input
    if args.n <= 0:
        print("Error: N must be a positive integer")
        return 1
    
    # Generate and print Fibonacci sequence
    fib_numbers = generate_fibonacci(args.n)
    print(','.join(fib_numbers))
    
    return 0


if __name__ == '__main__':
    main()