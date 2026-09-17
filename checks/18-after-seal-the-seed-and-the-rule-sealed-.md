# Check 18

after Seal the seed and the rule: sealed commitments and roots before any entry

How to test it: check 18: the live round's `<round>:seal` was written before its first pledge, carries a seed hash and the rule by version and no seed, and its signature verifies against the round's key.
