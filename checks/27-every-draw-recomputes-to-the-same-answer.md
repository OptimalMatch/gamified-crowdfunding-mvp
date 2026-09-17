# Check 27

Every draw recomputes to the same answer: independent recomputations that agree within 100 in 100, over the script's run

How to test it: check 27: every proof this node holds recomputes from the regulator's own copy (`lib/verify.mjs`: signatures, commitment, entry set and root, the frozen rule with the seed and the beacon), and the escrow agreed on every live round before paying: 100 in 100.
