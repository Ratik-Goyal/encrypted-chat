// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Stores only batch commitments. Never submit message or account data here.
contract IntegrityCommitments {
    struct Batch {
        bytes32 merkleRoot;
        uint32 leafCount;
        uint64 committedAt;
    }

    address public owner;
    uint256 public totalBatches;
    mapping(uint256 => Batch) public batches;

    event BatchCommitted(
        uint256 indexed batchId,
        bytes32 indexed merkleRoot,
        uint32 leafCount,
        uint64 committedAt
    );
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can commit batches");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function commitBatch(bytes32 merkleRoot, uint32 leafCount) external onlyOwner returns (uint256 batchId) {
        require(merkleRoot != bytes32(0), "Merkle root is required");
        require(leafCount > 0, "Batch cannot be empty");

        batchId = totalBatches;
        batches[batchId] = Batch(merkleRoot, leafCount, uint64(block.timestamp));
        totalBatches = batchId + 1;

        emit BatchCommitted(batchId, merkleRoot, leafCount, uint64(block.timestamp));
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner is required");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
