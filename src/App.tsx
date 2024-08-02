import { useEffect, useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import {
  BrowserProvider,
  Contract,
  Transaction,
  TransactionLike
} from "ethers";
import { Turnkey } from "@turnkey/sdk-browser";
import { Turnkey as ServerTurnkey } from "@turnkey/sdk-server";
import { TurnkeySigner } from "@turnkey/ethers";
import { DEFAULT_ETHEREUM_ACCOUNTS } from "@turnkey/sdk-server";
import { WebauthnStamper } from "@turnkey/webauthn-stamper";
import { TurnkeyClient, createActivityPoller } from "@turnkey/http";
import { createHash } from "sha256-uint8array";


function App() {
  const [count, setCount] = useState(0);


  const turnkey = new Turnkey({
    apiBaseUrl: "https://api.turnkey.com",
    defaultOrganizationId: "b53ce2e4-7745-4cd0-949c-c453915f5594"
  })

  const passkeyClient = turnkey.passkeyClient();

  const servertTrnkey = new ServerTurnkey({
    apiBaseUrl: "https://api.turnkey.com",
    apiPrivateKey: "46837e8d256e921d5132bd3cd6e4a83325d39eb69c79480aebd2bd840cdee7df",
    apiPublicKey: "03c68563d567b5a01aef1e6f7c0ebf9c8f5be08dd86513e10d78cab4fb39b3ee92",
    defaultOrganizationId: "b53ce2e4-7745-4cd0-949c-c453915f5594"
  });

  const apiClient = servertTrnkey.apiClient();

  let userTurnkeyAccount: string;
  let subOrgId: string;


  const create = async () => {

    const browserProvider = new BrowserProvider(window.ethereum);
    await browserProvider.send("eth_requestAccounts", []);

    const firstSigner = (await browserProvider.listAccounts())[0];
    const accountAddress = await firstSigner.getAddress();
    console.log("Account Address: ", accountAddress);

    const randomNum = Math.floor(Math.random() * 1000);

    const { encodedChallenge: challenge, attestation } = await passkeyClient.createUserPasskey({
      // rpId: "zklink.io",
      publicKey: {
        user: {
          name: "ZKLink_User_" + randomNum,
          displayName: "ZKLink_User_" + randomNum
        }
      }
    })

    // receive posted credential

    const subOrganizationConfig = {
      subOrganizationName: "ZKLink_User_" + accountAddress + "_" + randomNum,
      rootUsers: [{
        userName: accountAddress,
        userEmail: "hechu1213@gmail.com",
        apiKeys: [],
        authenticators: [
          {
            authenticatorName: "zklink_test",
            challenge: challenge,
            attestation: attestation
          }
        ],
        oauthProviders: []
      }],
      rootQuorumThreshold: 1,
      wallet: {
        walletName: "ZKLink_User_" + accountAddress + "_" + randomNum,
        accounts: DEFAULT_ETHEREUM_ACCOUNTS
      }
    }

    const subOrganizationResponse = await apiClient.createSubOrganization(subOrganizationConfig);
    console.log("Sub Organization Response: ", subOrganizationResponse);
    subOrgId = subOrganizationResponse.subOrganizationId;
    console.log("Sub Organization ID: ", subOrgId);
    userTurnkeyAccount = subOrganizationResponse.wallet?.addresses[0] ?? "";
    console.log("User Turnkey Account: ", userTurnkeyAccount);

  }

  const test = async () => {

  }

  function getChallengeFromPayload(payload: string): Uint8Array {
    const hexString = createHash().update(payload).digest("hex");
    return new TextEncoder().encode(hexString);
  }

  const sign = async () => {
    // console.log("User Turnkey Account: ", userTurnkeyAccount);


    const stamper = new WebauthnStamper({
      rpId: "localhost",
    });

    // New HTTP client able to sign with passkeys
    const httpClient = new TurnkeyClient(
      { baseUrl: "https://api.turnkey.com" },
      stamper
    );

    const turnkey = new Turnkey({
      apiBaseUrl: "https://api.turnkey.com",
      defaultOrganizationId: "b53ce2e4-7745-4cd0-949c-c453915f5594"
    })

    const passkeyClient = turnkey.passkeyClient();

    const resp = await passkeyClient.login()
    if (resp.organizationId) {
      const userOrgId = resp.organizationId;
      console.log("User Organization ID: ", userOrgId);

      const userWalletId = (await passkeyClient.getWallets(resp.organizationId)).wallets[0].walletId;
      const userWallet = (await passkeyClient.getWalletAccounts({ organizationId: userOrgId, walletId: userWalletId })).accounts[0].address;
      console.log("User Wallet: ", userWallet);


      const nftAddress = "0x1758f42Af7026fBbB559Dc60EcE0De3ef81f665e";
      const nftContract = new Contract(nftAddress, [{ "inputs": [{ "internalType": "address", "name": "to", "type": "address" }], "name": "safeMint", "outputs": [], "stateMutability": "nonpayable", "type": "function" }]);
      const baseMintNFTCallData = nftContract.interface.encodeFunctionData("safeMint", [userWallet]);
      const transactionRequest = {
        to: nftAddress,
        data: baseMintNFTCallData,
      };
      console.log("Transaction: ", transactionRequest);

      const tx = Transaction.from({
        ...transactionRequest,
      });
      console.log("Transaction: ", tx);

      const unsignedTx = tx.unsignedSerialized.substring(2);
      console.log("Unsigned Transaction: ", unsignedTx);

      const challenge = getChallengeFromPayload(JSON.stringify({
        type: "ACTIVITY_TYPE_SIGN_TRANSACTION_V2",
        timestampMs: String(Date.now()),
        organizationId: userOrgId,
        parameters: {
          signWith: userWallet,
          type: "TRANSACTION_TYPE_ETHEREUM",
          unsignedTransaction: unsignedTx
        }
      }));
      console.log("Challenge: ", challenge);


      const stamp = await httpClient.stamper.stamp(JSON.stringify({
        type: "ACTIVITY_TYPE_SIGN_TRANSACTION_V2",
        timestampMs: String(Date.now()),
        organizationId: userOrgId,
        parameters: {
          signWith: userWallet,
          type: "TRANSACTION_TYPE_ETHEREUM",
          unsignedTransaction: unsignedTx
        }
      }))

      console.log("Stamp: ", stamp);

    }

    // // Alternatively, you can POST directly from your frontend.
    // // Our HTTP client will use the webauthn stamper and the configured baseUrl automatically!
    // const activityPoller = createActivityPoller({
    //   client: httpClient,
    //   requestFn: httpClient.signTransaction,
    // });


    // Contains the activity result; no backend proxy needed!
    // const completedActivity = await activityPoller({
    //   type: "ACTIVITY_TYPE_SIGN_TRANSACTION_V2",
    //   timestampMs: String(Date.now()),
    //   organizationId: subOrgId,
    //   parameters: {
    //     signWith: userTurnkeyAccount,
    //     type: "TRANSACTION_TYPE_ETHEREUM",
    //     unsignedTransaction: unsignedTx
    //   }
    // })

    // console.log("Completed Activity: ", completedActivity);

  }


  const send = async () => {

    const browserProvider = new BrowserProvider(window.ethereum);
    await browserProvider.send("eth_requestAccounts", []);

    const firstSigner = (await browserProvider.listAccounts())[0];
    const accountAddress = await firstSigner.getAddress();
    console.log("Account Address: ", accountAddress);

    const turnkey = new Turnkey({
      apiBaseUrl: "https://api.turnkey.com",
      defaultOrganizationId: subOrgId
    })
    const client = turnkey.passkeyClient();


    const turnkeySigner = new TurnkeySigner({
      client: client,
      organizationId: subOrgId,
      signWith: userTurnkeyAccount
    })

    // a provider is required if you want to interact with the live network, 
    // i.e. broadcast transactions, fetch gas prices, etc.
    const connectedSigner = turnkeySigner.connect(browserProvider);

    const nftAddress = "0x1758f42Af7026fBbB559Dc60EcE0De3ef81f665e";

    const nftContract = new Contract(nftAddress, [{ "inputs": [{ "internalType": "address", "name": "to", "type": "address" }], "name": "safeMint", "outputs": [], "stateMutability": "nonpayable", "type": "function" }]);
    const baseMintNFTCallData = nftContract.interface.encodeFunctionData("safeMint", [accountAddress]);

    const transactionRequest = {
      to: nftAddress,
      data: baseMintNFTCallData,
    };
    console.log("Transaction: ", transactionRequest);

    const transactionResult = await connectedSigner.signTransaction(transactionRequest);
    console.log("Transaction Result: ", transactionResult);

  };



  return (
    <>
      <div>
        <a href="https://vitejs.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={create}>Create</button>
        <button onClick={sign}>Sign</button>
        <button onClick={send}>Send</button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;
