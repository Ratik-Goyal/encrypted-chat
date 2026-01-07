// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title MessageStorage
 * @dev Stores encrypted messages on the Ethereum blockchain
 * @notice Part of the SecureChat encrypted messaging platform
 */
contract MessageStorage {
    struct Message {
        address from;
        address to;
        bytes encryptedData;
        uint256 timestamp;
        bytes32 messageHash;
    }
    
    Message[] public messages;
    mapping(address => uint256[]) public userMessages;
    
    event MessageStored(
        uint256 indexed messageId,
        address indexed from,
        address indexed to,
        uint256 timestamp
    );
    
    /**
     * @dev Store an encrypted message on the blockchain
     * @param _to The recipient's address
     * @param _encryptedData The encrypted message data
     * @return messageId The ID of the stored message
     */
    function storeMessage(
        address _to,
        bytes memory _encryptedData
    ) public returns (uint256) {
        bytes32 hash = keccak256(abi.encodePacked(msg.sender, _to, _encryptedData, block.timestamp));
        
        Message memory newMessage = Message({
            from: msg.sender,
            to: _to,
            encryptedData: _encryptedData,
            timestamp: block.timestamp,
            messageHash: hash
        });
        
        messages.push(newMessage);
        uint256 messageId = messages.length - 1;
        
        userMessages[msg.sender].push(messageId);
        userMessages[_to].push(messageId);
        
        emit MessageStored(messageId, msg.sender, _to, block.timestamp);
        
        return messageId;
    }
    
    /**
     * @dev Retrieve a message by its ID
     * @param _messageId The ID of the message to retrieve
     */
    function getMessage(uint256 _messageId) public view returns (
        address from,
        address to,
        bytes memory encryptedData,
        uint256 timestamp,
        bytes32 messageHash
    ) {
        require(_messageId < messages.length, "Message does not exist");
        Message memory storedMsg = messages[_messageId];
        return (storedMsg.from, storedMsg.to, storedMsg.encryptedData, storedMsg.timestamp, storedMsg.messageHash);
    }
    
    /**
     * @dev Get all message IDs for a user
     * @param _user The user's address
     */
    function getUserMessages(address _user) public view returns (uint256[] memory) {
        return userMessages[_user];
    }
    
    /**
     * @dev Get the total number of messages stored
     */
    function getTotalMessages() public view returns (uint256) {
        return messages.length;
    }
}
