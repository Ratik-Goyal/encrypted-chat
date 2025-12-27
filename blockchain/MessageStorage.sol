// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

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
    
    function getMessage(uint256 _messageId) public view returns (
        address from,
        address to,
        bytes memory encryptedData,
        uint256 timestamp,
        bytes32 messageHash
    ) {
        require(_messageId < messages.length, "Message does not exist");
        Message memory msg = messages[_messageId];
        return (msg.from, msg.to, msg.encryptedData, msg.timestamp, msg.messageHash);
    }
    
    function getUserMessages(address _user) public view returns (uint256[] memory) {
        return userMessages[_user];
    }
    
    function getTotalMessages() public view returns (uint256) {
        return messages.length;
    }
}
