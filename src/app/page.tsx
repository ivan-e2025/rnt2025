'use client'

import {
  useAccount,
  useContractRead,
  useConnect,
  useDisconnect,
  useBalance,
  useWriteContract,
  useWaitForTransactionReceipt
} from 'wagmi'
import { useState, useEffect } from 'react'
import nftContractData from '@/abis/EnergyD.json';
import { parseEther } from 'viem';

const energyDContractAddress = '0x1bB594e32D0a63b5AdeE411c9F6448Be1A60f99A'
const MAX_TOKENS = 3;

function NFTList() {
  const { address } = useAccount();
  const [ownedNFTs, setOwnedNFTs] = useState<string[]>([]);
  type NftData = {
    [key: string]: {
      wattHours?: string;
      timestamp?: string;
      location?: string;
      powerPlantType?: string;
    };
  };

  const [nftData, setNftData] = useState<NftData>({});
  const [recipientAddresses, setRecipientAddresses] = useState<Record<string, string>>({});
  const [transferringTokenId, setTransferringTokenId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokensChecked, setTokensChecked] = useState(0);

  type EnergyData = {
    wattHours?: number;
    timestamp?: number;
    location?: string;
    powerPlantType?: string;
  };

  const { data: maxTokenIdFromContract } = useContractRead({
    address: energyDContractAddress,
    abi: nftContractData.abi,
    functionName: 'getTokenCounter',
    args: [],
  });

  const maxTokensToCheck = maxTokenIdFromContract !== undefined && maxTokenIdFromContract !== null
    ? parseInt(maxTokenIdFromContract.toString())
    : MAX_TOKENS;

  const ownerOfResult = useContractRead({
    address: energyDContractAddress,
    abi: nftContractData.abi,
    functionName: 'ownerOf',
    args: [BigInt(tokensChecked)],
    query: {
      enabled: tokensChecked < maxTokensToCheck && address !== undefined,
    },
  });

  const currentTokenIdForDataFetch = ownedNFTs.length > 0 ? ownedNFTs[ownedNFTs.length - 1] : null;

  const energyDataResult = useContractRead({
    address: energyDContractAddress,
    abi: nftContractData.abi,
    functionName: 'getEnergyData',
    args: currentTokenIdForDataFetch ? [BigInt(currentTokenIdForDataFetch)] : [],
    query: {
      enabled: Boolean(currentTokenIdForDataFetch) && address !== undefined,
    },
  });

  const { writeContract, data: hash, isPending: isWalletConfirming } = useWriteContract();

  const { isLoading: isBlockchainConfirming, isSuccess: transferSuccess, error: transferErrorData } =
    useWaitForTransactionReceipt({
      hash,
      query: {
        enabled: Boolean(hash),
      },
    });

  useEffect(() => {
    if (maxTokenIdFromContract !== undefined && maxTokenIdFromContract !== null) {
      setLoading(true);
      setTokensChecked(0);
      setOwnedNFTs([]);
      setNftData({});
      setRecipientAddresses({});
    }
  }, [maxTokenIdFromContract, address]);


  useEffect(() => {
    if (address && tokensChecked < maxTokensToCheck) {
      if (!ownerOfResult.isLoading && ownerOfResult.status === 'success') {
        if (typeof ownerOfResult.data === 'string' && ownerOfResult.data?.toLowerCase() === address.toLowerCase()) {
          setOwnedNFTs(prev => [...prev, tokensChecked.toString()]);
          setRecipientAddresses(prev => ({ ...prev, [tokensChecked.toString()]: '' }));
        }
        setTokensChecked(prev => prev + 1);
      } else if (ownerOfResult.status === 'error') {
        console.error(`Error checking ownerOf for token ${tokensChecked}:`, ownerOfResult.error);
        setTokensChecked(prev => prev + 1);
      }
    } else if (tokensChecked >= maxTokensToCheck && loading) {
      setLoading(false);
    }
  }, [address, tokensChecked, maxTokensToCheck, ownerOfResult.data, ownerOfResult.isLoading, ownerOfResult.status, ownerOfResult.error, loading]);


  useEffect(() => {
    if (energyDataResult.data && currentTokenIdForDataFetch) {
      const energyInfo = energyDataResult.data as EnergyData;
      setNftData(prev => ({
        ...prev,
        [currentTokenIdForDataFetch]: {
          wattHours: energyInfo.wattHours?.toString() || "0",
          timestamp: energyInfo.timestamp?.toString() || "0",
          location: energyInfo.location || "Unknown",
          powerPlantType: energyInfo.powerPlantType || "Unknown",
        },
      }));
    }
  }, [energyDataResult.data, currentTokenIdForDataFetch]);


  useEffect(() => {
    if (ownerOfResult.isError || energyDataResult.isError) {
      if (!(ownerOfResult.isError && tokensChecked <= maxTokensToCheck && ownerOfResult.error?.name === 'ContractFunctionExecutionError') && !(energyDataResult.isError && ownedNFTs.length === 0)) {
         setError(ownerOfResult.error?.message || energyDataResult.error?.message || "Error fetching NFT data.");
      }
      setLoading(false);
    }
  }, [ownerOfResult.isError, energyDataResult.isError, ownerOfResult.error, energyDataResult.error, tokensChecked, maxTokensToCheck, ownedNFTs.length]);


  const handleRecipientAddressChange = (tokenId: string, value: string) => {
    setRecipientAddresses(prev => ({ ...prev, [tokenId]: value }));
  };

  const handleTransferClick = (tokenId: string) => {
    if (!address) {
      setError("Wallet not connected.");
      return;
    }
    const recipient = recipientAddresses[tokenId];
    if (!recipient || !/^(0x)?[0-9a-fA-F]{40}$/.test(recipient)) {
      setError("Please enter a valid recipient address.");
      return;
    }

    setError(null);
    setTransferringTokenId(tokenId);

    writeContract({
      address: energyDContractAddress,
      abi: nftContractData.abi,
      functionName: 'transferFrom',
      args: [
        address,
        recipient as `0x${string}`,
        BigInt(tokenId)
      ],
    });
  };

  useEffect(() => {
    if (transferringTokenId && hash && !isWalletConfirming && (transferSuccess || transferErrorData)) {
      if (transferSuccess) {
        alert(`Transfer of Token ID ${transferringTokenId} successful! Transaction Hash: ${hash}`);
        setOwnedNFTs(prev => prev.filter(id => id !== transferringTokenId));
        setNftData(prev => {
            const newState = { ...prev };
            delete newState[transferringTokenId];
            return newState;
        });
        setRecipientAddresses(prev => {
            const newState = { ...prev };
            delete newState[transferringTokenId];
            return newState;
        });
      } else if (transferErrorData) {
        alert(`Transfer of Token ID ${transferringTokenId} failed: ${transferErrorData.message}`);
      }
      setTransferringTokenId(null);
    }
  }, [hash, isWalletConfirming, transferSuccess, transferErrorData, transferringTokenId]);


  if (!address) {
    return <div className="info-message">Connect your wallet to see your Energy NFTs.</div>;
  }

  if (loading) {
    return <div className="info-message">Checking for your Energy NFTs...</div>;
  }

  if (error) {
    return <div className="info-message status-error">Error: {error}</div>;
  }

  if (ownedNFTs.length === 0 && !loading) {
    return <div className="info-message">No Energy NFTs owned by this account.</div>;
  }

  return (
    <div className="nft-list-container">
      <h3>Your Energy NFTs</h3>
      <ul className="nft-grid">
        {ownedNFTs.map(tokenId => (
          <li key={tokenId} className="nft-card">
            <h4>Token ID: {tokenId}</h4>
            {nftData[tokenId] ? (
              <div className="nft-details">
                <p><strong>Watt-Hour:</strong> {nftData[tokenId].wattHours}</p>
                <p><strong>Timestamp:</strong> {new Date(parseInt(nftData[tokenId].timestamp || "0") * 1000).toLocaleString()}</p>
                <p><strong>Location:</strong> {nftData[tokenId].location}</p>
                <p><strong>Power Plant Type:</strong> {nftData[tokenId].powerPlantType}</p>
                <div className="nft-input-group">
                  <input
                    type="text"
                    placeholder="Recipient Address (0x...)"
                    value={recipientAddresses[tokenId] || ''}
                    onChange={(e) => handleRecipientAddressChange(tokenId, e.target.value)}
                  />
                  <button
                    onClick={() => handleTransferClick(tokenId)}
                    disabled={
                      !recipientAddresses[tokenId] ||
                      !/^(0x)?[0-9a-fA-F]{40}$/.test(recipientAddresses[tokenId]) ||
                      (isWalletConfirming && transferringTokenId === tokenId) ||
                      (isBlockchainConfirming && transferringTokenId === tokenId)
                    }
                  >
                    {isWalletConfirming && transferringTokenId === tokenId
                      ? 'Confirm in Wallet...'
                      : isBlockchainConfirming && transferringTokenId === tokenId
                      ? 'Transferring...'
                      : 'Transfer'}
                  </button>
                </div>
                {transferringTokenId === tokenId && isWalletConfirming && <div className="nft-status-message status-pending">Awaiting wallet confirmation...</div>}
                {transferringTokenId === tokenId && isBlockchainConfirming && <div className="nft-status-message status-pending">Waiting for transaction to be mined...</div>}
                {transferringTokenId === tokenId && transferSuccess && <div className="nft-status-message status-success">Transfer successful!</div>}
                {transferringTokenId === tokenId && transferErrorData && <div className="nft-status-message status-error">Transfer failed: {transferErrorData.message}</div>}
              </div>
            ) : (
              <div>Loading details...</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}


function App() {
  const account = useAccount()
  const { connectors, connect, status, error } = useConnect()
  const { disconnect } = useDisconnect()

  const [lastClickedConnectorId, setLastClickedConnectorId] = useState<string | null>(null);

  function MyBalance({ address }: { address: string }) {
    const formattedAddress = address.startsWith("0x")
      ? (address as `0x${string}`)
      : (`0x${address}` as `0x${string}`);

    const { data, isError, isLoading } = useBalance({
      address: formattedAddress,
    })

    if (isLoading) return <div>Fetching balance...</div>
    if (isError) return <div>Error fetching balance</div>
    return <div>{data?.formatted} {data?.symbol}</div>
  }

  return (
    <div id="root-container">
      <div className="section">
        <h2>Account</h2>

        <div>
          <p><strong>Status:</strong> {account.status}</p>
          <p><strong>Address:</strong> {account.addresses ? account.addresses[0] : 'N/A'}</p>
          <p><strong>Chain ID:</strong> {account.chainId}</p>
          <p><strong>Current Balance:</strong> {account.address && <MyBalance address={account.address} />}</p>
        </div>

        {account.status === 'connected' && (
          <button type="button" onClick={() => disconnect()}>
            Disconnect
          </button>
        )}
      </div>

      <div className="section">
        <h2>Connect</h2>
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            onClick={() => {
              setLastClickedConnectorId(connector.id);
              connect({ connector });
            }}
            type="button"
            disabled={status === 'pending' && lastClickedConnectorId === connector.id}
          >
            {connector.name}
            {/* Check error message for 'not found' indicator */}
            {status === 'pending' && lastClickedConnectorId === connector.id && ' (connecting...)'}
            {error && lastClickedConnectorId === connector.id && error.message.includes('not found') && ' (not found)'}
          </button>
        ))}
        {status && <p className="info-message">{status}</p>}
        {/* General error display, excluding specific 'not found' errors already handled */}
        {error && (!lastClickedConnectorId || !error.message.includes('not found')) && <p className="info-message status-error">Error: {error?.message}</p>}
      </div>

      <NFTList />
    </div>
  )
}

export default App
