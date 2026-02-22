# Fibonacci Number Generator

A simple Python command-line program that prints the first N Fibonacci numbers, separated by commas.

## Usage

### Basic usage (prints 100 Fibonacci numbers by default):
```bash
python fibonacci.py
```

### Specify a custom number of Fibonacci numbers:
```bash
python fibonacci.py 20
```

This will print the first 20 Fibonacci numbers.

## Requirements

- Python 3.x

## Examples

Print first 10 Fibonacci numbers:
```bash
python fibonacci.py 10
```
Output: `0,1,1,2,3,5,8,13,21,34`

Print first 15 Fibonacci numbers:
```bash
python fibonacci.py 15
```
Output: `0,1,1,2,3,5,8,13,21,34,55,89,144,233,377`

## Notes

- The program defaults to printing 100 Fibonacci numbers if no argument is provided
- The argument must be a positive integer
- If you provide 0 or a negative number, you'll get an error message