"""
Fibonacci sequence calculator.

The Fibonacci sequence is a series of numbers where each number is the sum 
of the two preceding ones, starting from 0 and 1.
"""

def fibonacci(n):
    """
    Calculate the nth Fibonacci number.
    
    Args:
        n (int): The position in the Fibonacci sequence (0-indexed).
    
    Returns:
        int: The nth Fibonacci number.
    
    Examples:
        >>> fibonacci(0)
        0
        >>> fibonacci(1)
        1
        >>> fibonacci(5)
        5
        >>> fibonacci(10)
        55
    """
    if n < 0:
        raise ValueError("Input must be a non-negative integer")
    
    if n == 0:
        return 0
    elif n == 1:
        return 1
    
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    
    return b


def fibonacci_sequence(length):
    """
    Generate a Fibonacci sequence of given length.
    
    Args:
        length (int): The number of Fibonacci numbers to generate.
    
    Returns:
        list: A list containing the first 'length' Fibonacci numbers.
    
    Examples:
        >>> fibonacci_sequence(0)
        []
        >>> fibonacci_sequence(1)
        [0]
        >>> fibonacci_sequence(5)
        [0, 1, 1, 2, 3]
    """
    if length < 0:
        raise ValueError("Length must be a non-negative integer")
    
    if length == 0:
        return []
    
    sequence = [0]
    if length == 1:
        return sequence
    
    sequence.append(1)
    
    for i in range(2, length):
        next_num = sequence[-1] + sequence[-2]
        sequence.append(next_num)
    
    return sequence


if __name__ == "__main__":
    # Test the functions
    print("Testing fibonacci(n):")
    for i in range(11):
        print(f"fibonacci({i}) = {fibonacci(i)}")
    
    print("\nTesting fibonacci_sequence(length):")
    for length in [0, 1, 5, 10]:
        print(f"fibonacci_sequence({length}) = {fibonacci_sequence(length)}")
