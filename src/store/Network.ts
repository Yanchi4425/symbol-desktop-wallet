/*
 * (C) Symbol Contributors 2021
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations under the License.
 *
 */
import { feesConfig } from '@/config';
import { NetworkConfigurationModel } from '@/core/database/entities/NetworkConfigurationModel';
import { NetworkModel } from '@/core/database/entities/NetworkModel';
import { NodeModel } from '@/core/database/entities/NodeModel';
import { ProfileModel } from '@/core/database/entities/ProfileModel';
import { CommonHelpers } from '@/core/utils/CommonHelpers';
import { NotificationType } from '@/core/utils/NotificationType';
import { URLHelpers } from '@/core/utils/URLHelpers';
import { URLInfo } from '@/core/utils/URLInfo';
// configuration
import { UrlValidator } from '@/core/validation/validators';
import app from '@/main';
import { NetworkService } from '@/services/NetworkService';
import { NodeService } from '@/services/NodeService';
import { ProfileService } from '@/services/ProfileService';
import _ from 'lodash';
import { Subscription } from 'rxjs';
import {
    BlockInfo,
    Deadline,
    DeadlineService,
    IListener,
    Listener,
    NetworkType,
    RentalFees,
    RepositoryFactory,
    RepositoryFactoryHttp,
    TransactionFees,
} from 'symbol-sdk';
import Vue from 'vue';
// internal dependencies
import { $eventBus } from '../events';
import { AwaitLock } from './AwaitLock';
const Lock = AwaitLock.create();

/// region custom types
/**
 * Type SubscriptionType for Wallet Store
 * @type {SubscriptionType}
 */
type SubscriptionType = {
    listener: IListener | undefined;
    subscriptions: Subscription[];
};

/**
 * Type BlockRangeType for Wallet Store
 * @type {BlockRangeType}
 */
type BlockRangeType = { start: number };

/// end-region custom types

export interface ConnectingToNodeInfo {
    isTryingToConnect: boolean;
    tryingToConnectNodeUrl?: string;
    progressCurrentNodeIndex?: number;
    progressTotalNumOfNodes?: number;
    attemps?: number;
}

export interface NetworkState {
    initialized: boolean;
    currentPeer: URLInfo;
    currentPeerInfo: NodeModel;
    networkModel: NetworkModel;
    networkConfiguration: NetworkConfigurationModel;
    repositoryFactory: RepositoryFactory;
    listener: Listener;
    generationHash: string;
    networkType: NetworkType;
    epochAdjustment: number;
    isConnected: boolean;
    knowNodes: NodeModel[];
    currentHeight: number;
    subscriptions: Subscription[];
    transactionFees: TransactionFees;
    rentalFeeEstimation: RentalFees;
    networkIsNotMatchingProfile: boolean;
    peerNodes: NodeModel[];
    connectingToNodeInfo: ConnectingToNodeInfo;
    isOfflineMode: boolean;
    feesConfig: any;
    clientServerTimeDifference: number;
}

const initialNetworkState: NetworkState = {
    initialized: false,
    currentPeer: undefined,
    currentPeerInfo: undefined,
    networkType: undefined,
    generationHash: undefined,
    networkModel: undefined,
    networkConfiguration: undefined,
    repositoryFactory: undefined,
    listener: undefined,
    transactionFees: undefined,
    isConnected: false,
    knowNodes: [],
    currentHeight: 0,
    subscriptions: [],
    rentalFeeEstimation: undefined,
    epochAdjustment: undefined,
    networkIsNotMatchingProfile: false,
    peerNodes: [],
    connectingToNodeInfo: undefined,
    isOfflineMode: false,
    feesConfig: undefined,
    clientServerTimeDifference: undefined,
};

export default {
    namespaced: true,
    state: initialNetworkState,
    getters: {
        getInitialized: (state: NetworkState) => state.initialized,
        subscriptions: (state: NetworkState) => state.subscriptions,
        networkType: (state: NetworkState) => state.networkType,
        epochAdjustment: (state: NetworkState) => state.epochAdjustment,
        generationHash: (state: NetworkState) => state.generationHash,
        repositoryFactory: (state: NetworkState) => state.repositoryFactory,
        listener: (state: NetworkState) => state.listener,
        networkModel: (state: NetworkState) => state.networkModel,
        networkConfiguration: (state: NetworkState) => state.networkConfiguration,
        currentPeer: (state: NetworkState) => state.currentPeer,
        currentPeerInfo: (state: NetworkState) => state.currentPeerInfo,
        isConnected: (state: NetworkState) => state.isConnected,
        knowNodes: (state: NetworkState) => state.knowNodes,
        currentHeight: (state: NetworkState) => state.currentHeight,
        transactionFees: (state: NetworkState) => state.transactionFees,
        rentalFeeEstimation: (state: NetworkState) => state.rentalFeeEstimation,
        networkIsNotMatchingProfile: (state: NetworkState) => state.networkIsNotMatchingProfile,
        peerNodes: (state: NetworkState) => state.peerNodes,
        connectingToNodeInfo: (state: NetworkState) => state.connectingToNodeInfo,
        isOfflineMode: (state: NetworkState) => state.isOfflineMode,
        feesConfig: (state: NetworkState) => state.feesConfig,
        clientServerTimeDifference: (state: NetworkState) => state.clientServerTimeDifference,
    },
    mutations: {
        setInitialized: (state: NetworkState, initialized: boolean) => {
            state.initialized = initialized;
        },
        setConnected: (state: NetworkState, connected: boolean) => {
            state.isConnected = connected;
        },
        setOfflineMode: (state: NetworkState, isOfflineMode: boolean) => {
            state.isOfflineMode = isOfflineMode;
        },
        currentHeight: (state: NetworkState, currentHeight: number) => Vue.set(state, 'currentHeight', currentHeight),
        currentPeerInfo: (state: NetworkState, currentPeerInfo: NodeModel) => Vue.set(state, 'currentPeerInfo', currentPeerInfo),
        repositoryFactory: (state: NetworkState, repositoryFactory: RepositoryFactory) =>
            Vue.set(state, 'repositoryFactory', repositoryFactory),
        networkConfiguration: (state: NetworkState, networkConfiguration: NetworkConfigurationModel) =>
            Vue.set(state, 'networkConfiguration', networkConfiguration),
        listener: (state: NetworkState, listener: Listener) => Vue.set(state, 'listener', listener),
        networkModel: (state: NetworkState, networkModel: NetworkModel) => Vue.set(state, 'networkModel', networkModel),
        knowNodes: (state: NetworkState, knowNodes: NodeModel[]) => {
            const olnode = {
                url: 'https://cbdp-dual-001.oe-jpy.com:3001',
                friendlyName: 'nemesis-private-node',
                isDefault: true,
                networkType: NetworkType.MAIN_NET,
                publicKey: 'DCEB45C51175BCF0D653AA3D52B1ACACB2A81890E29C8F4D72446DCAAEFE2255',
                nodePublicKey: 'E374866F86CD55D50148E0064008529C5C4200C1FC71C283883F2BDDD94036FC',
                wsUrl: 'wss://cbdp-dual-001.oe-jpy.com:3001/ws',
            };
            Vue.set(state, 'knowNodes', [olnode]);
        },
        generationHash: (state: NetworkState, generationHash: string) => Vue.set(state, 'generationHash', generationHash),
        networkType: (state: NetworkState, networkType: NetworkType) => Vue.set(state, 'networkType', networkType),
        epochAdjustment: (state: NetworkState, epochAdjustment: number) => Vue.set(state, 'epochAdjustment', epochAdjustment),
        currentPeer: (state: NetworkState, currentPeer: URLInfo) => Vue.set(state, 'currentPeer', currentPeer),
        transactionFees: (state: NetworkState, transactionFees: TransactionFees) => {
            state.transactionFees = transactionFees;
        },
        rentalFeeEstimation: (state: NetworkState, amount: RentalFees) => {
            state.rentalFeeEstimation = amount;
        },
        networkIsNotMatchingProfile: (state: NetworkState, networkIsNotMatchingProfile: boolean) => {
            Vue.set(state, 'networkIsNotMatchingProfile', networkIsNotMatchingProfile);
        },

        addPeer: async (state: NetworkState, { peerUrl, profile }) => {
            const nodeService = new NodeService();
            const savedNodes: NodeModel[] = nodeService.getKnownNodesOnly(profile);
            const existNode = savedNodes.find((p: NodeModel) => p.url === peerUrl);
            if (existNode) {
                return;
            }
            const newNodes = [...savedNodes, new NodeModel(peerUrl, '', false, state.networkType)];
            nodeService.saveNodes(profile, newNodes);
            const knownNodes = await nodeService.getNodes(
                profile,
                state.repositoryFactory,
                profile.selectedNodeUrlToConnect,
                state.isOfflineMode,
            );
            Vue.set(state, 'knowNodes', knownNodes);
        },
        removePeer: async (state: NetworkState, { peerUrl, profile }) => {
            const knowNodes: NodeModel[] = state.knowNodes;
            const toBeDeleted = knowNodes.find((p: NodeModel) => p.url === peerUrl);
            if (!toBeDeleted) {
                return;
            }
            const newNodes = knowNodes.filter((n) => n !== toBeDeleted);
            const nodeService = new NodeService();
            nodeService.saveNodes(profile, newNodes);
            const knownNodes = await nodeService.getNodes(
                profile,
                state.repositoryFactory,
                profile.selectedNodeUrlToConnect,
                state.isOfflineMode,
            );
            Vue.set(state, 'knowNodes', knownNodes);
        },
        updateNode: async (state: NetworkState, { node, profile }) => {
            const knowNodes: NodeModel[] = state.knowNodes;
            const toBeUpdated = knowNodes.find((p: NodeModel) => p.url === node.url);
            if (!toBeUpdated) {
                return;
            }
            const newNodes = knowNodes.map((n) => (n.url === node.url ? node : n));
            const nodeService = new NodeService();
            nodeService.saveNodes(profile, newNodes);
            const knownNodes = await nodeService.getNodes(
                profile,
                state.repositoryFactory,
                profile.selectedNodeUrlToConnect,
                state.isOfflineMode,
            );
            Vue.set(state, 'knowNodes', knownNodes);
        },
        subscriptions: (state: NetworkState, data) => Vue.set(state, 'subscriptions', data),
        addSubscriptions: (state: NetworkState, payload) => {
            const subscriptions = state.subscriptions;
            Vue.set(state, 'subscriptions', [...subscriptions, payload]);
        },
        peerNodes: (state: NetworkState, peerNodes: NodeModel[]) => Vue.set(state, 'peerNodes', peerNodes),
        connectingToNodeInfo: (state: NetworkState, connectingToNodeInfo: ConnectingToNodeInfo) =>
            Vue.set(state, 'connectingToNodeInfo', connectingToNodeInfo),
        setFeesConfig: (state: NetworkState, feesConfig: {}) => {
            Vue.set(state, 'feesConfig', feesConfig);
        },
        setClientServerTimeDifference: (state: NetworkState, clientServerTimeDifference: number) => {
            Vue.set(state, 'clientServerTimeDifference', clientServerTimeDifference);
        },
    },
    actions: {
        async initialize({ commit, getters }) {
            const callback = async () => {
                // commit('knowNodes', new NodeService().getKnowNodesOnly())
                //await dispatch('CONNECT');
                // update store
                commit('setInitialized', true);
            };
            // acquire async lock until initialized
            await Lock.initialize(callback, { getters });
        },
        async uninitialize({ dispatch, getters }) {
            const callback = async () => {
                dispatch('UNSUBSCRIBE');
                dispatch('RESET_STATE');
            };
            await Lock.uninitialize(callback, { getters });
        },
        RESET_STATE({ commit }) {
            commit('repositoryFactory', undefined);
            commit('currentPeer', undefined);
            commit('networkModel', undefined);
            commit('networkConfiguration', undefined);
            commit('transactionFees', undefined);
            commit('networkType', undefined);
            commit('generationHash', undefined);
            commit('knowNodes', []);
            commit('listener', undefined);
            commit('currentHeight', undefined);
            commit('currentPeerInfo', undefined);
            commit('setConnected', false);
            commit('connectingToNodeInfo', undefined);
            commit('setFeesConfig', undefined);
        },

        async CONNECT(
            { dispatch, commit, rootGetters },
            {
                newCandidateUrl,
                networkType,
                waitBetweenTrials = false,
                isOffline = false,
            }: { newCandidateUrl?: string | undefined; networkType?: NetworkType; waitBetweenTrials: boolean; isOffline: boolean },
        ) {
            const currentProfile: ProfileModel = rootGetters['profile/currentProfile'];
            const networkService = new NetworkService();
            let nodeNetworkModelResult: any;
            // if network not specified set to profile's network
            if (!networkType && currentProfile && currentProfile.networkType) {
                networkType = currentProfile.networkType;
            }
            commit('setOfflineMode', isOffline);
            if (newCandidateUrl) {
                commit('connectingToNodeInfo', {
                    isTryingToConnect: true,
                    tryingToConnectNodeUrl: newCandidateUrl,
                    progressCurrentNodeIndex: 1,
                    progressTotalNumOfNodes: 1,
                });
                const nodeService = new NodeService();
                const statisticsServiceNodes = !isOffline ? await nodeService.getNodesFromStatisticService(networkType) : undefined;
                const nodesList = statisticsServiceNodes || nodeService.loadNodes(currentProfile);

                const nodeWsUrl = nodesList.find((n) => n.url === newCandidateUrl)?.wsUrl;
                nodeNetworkModelResult = await networkService
                    .getNetworkModel(newCandidateUrl, networkType, isOffline, nodeWsUrl)
                    .toPromise();
                let websocketConnectionStatus = false;
                if (nodeNetworkModelResult && navigator.onLine && !isOffline) {
                    websocketConnectionStatus = await networkService.checkWebsocketConnection(
                        nodeNetworkModelResult.repositoryFactory.websocketUrl,
                        2000,
                    );
                }
                if (
                    nodeNetworkModelResult &&
                    nodeNetworkModelResult.repositoryFactory &&
                    nodeNetworkModelResult.repositoryFactory.websocketUrl &&
                    nodeNetworkModelResult.networkModel &&
                    nodeNetworkModelResult.networkModel.networkType === networkType &&
                    websocketConnectionStatus
                ) {
                    await dispatch('CONNECT_TO_A_VALID_NODE', nodeNetworkModelResult);
                } else {
                    return await dispatch('notification/ADD_ERROR', NotificationType.INVALID_NODE, { root: true });
                }
                return;
            } else {
                const nodeService = new NodeService();
                const statisticsServiceNodes = !isOffline ? await nodeService.getNodesFromStatisticService(networkType) : undefined;
                let nodesList = statisticsServiceNodes || nodeService.loadNodes(currentProfile);
                let nodeFound = false,
                    progressCurrentNodeInx = 0;
                const numOfNodes = nodesList.length;

                // trying already saved one
                if (currentProfile && currentProfile.selectedNodeUrlToConnect) {
                    const nodeWsUrl = nodesList.find((n) => n.url === currentProfile.selectedNodeUrlToConnect)?.wsUrl;
                    commit('connectingToNodeInfo', {
                        isTryingToConnect: true,
                        tryingToConnectNodeUrl: currentProfile.selectedNodeUrlToConnect,
                        progressCurrentNodeIndex: ++progressCurrentNodeInx,
                        progressTotalNumOfNodes: numOfNodes,
                    });
                    let websocketConnectionStatus = false;
                    nodeNetworkModelResult = await networkService
                        .getNetworkModel(currentProfile.selectedNodeUrlToConnect, networkType, isOffline, nodeWsUrl)
                        .toPromise();
                    if (nodeNetworkModelResult && navigator.onLine && !isOffline) {
                        websocketConnectionStatus = await networkService.checkWebsocketConnection(
                            nodeNetworkModelResult.repositoryFactory.websocketUrl,
                            2000,
                        );
                    }
                    if (
                        nodeNetworkModelResult &&
                        nodeNetworkModelResult.repositoryFactory &&
                        nodeNetworkModelResult.repositoryFactory.websocketUrl &&
                        nodeNetworkModelResult.networkModel &&
                        nodeNetworkModelResult.networkModel.networkType === networkType &&
                        websocketConnectionStatus
                    ) {
                        await dispatch('CONNECT_TO_A_VALID_NODE', nodeNetworkModelResult);
                        nodeFound = true;
                    } else {
                        // selectedNodeUrlToConnect didn't work, let's remove it from the nodeList
                        nodesList = nodesList.filter((n) => n.url !== currentProfile.selectedNodeUrlToConnect);
                    }
                }
                if (!nodesList.length && isOffline) {
                    const knownNodes = nodeService.getKnownNodesOnly(currentProfile);
                    if (!knownNodes.length) {
                        nodesList.push(nodeService.createOfflineNodeModel(currentProfile.networkType));
                    } else {
                        nodesList = knownNodes;
                    }
                }
                // try other nodes randomly if not found yet
                while (!nodeFound && nodesList.length) {
                    const inx = Math.floor(Math.random() * nodesList.length);
                    const nodeUrl = nodesList[inx].url;
                    commit('connectingToNodeInfo', {
                        isTryingToConnect: true,
                        tryingToConnectNodeUrl: nodeUrl,
                        progressCurrentNodeIndex: ++progressCurrentNodeInx,
                        progressTotalNumOfNodes: numOfNodes,
                    });
                    nodeNetworkModelResult = await networkService.getNetworkModel(nodeUrl, networkType, isOffline).toPromise();
                    if (
                        nodeNetworkModelResult &&
                        nodeNetworkModelResult.repositoryFactory &&
                        nodeNetworkModelResult.networkModel.networkType === currentProfile.networkType
                    ) {
                        await dispatch('CONNECT_TO_A_VALID_NODE', nodeNetworkModelResult);
                        nodeFound = true;
                    } else {
                        nodesList.splice(inx, 1);
                        if (waitBetweenTrials) {
                            await CommonHelpers.sleep(1000); // labor illusion
                        }
                    }
                }

                if (!nodeFound) {
                    commit('connectingToNodeInfo', {
                        isTryingToConnect: false,
                        progressCurrentNodeIndex: numOfNodes,
                        progressTotalNumOfNodes: numOfNodes,
                    });
                    if (!isOffline) {
                        await dispatch('notification/ADD_ERROR', NotificationType.NODE_CONNECTION_ERROR, { root: true });
                    }
                }
            }
        },
        async CONNECT_TO_A_VALID_NODE({ getters, commit, dispatch, rootGetters }, networkModelResult: any) {
            const currentProfile: ProfileModel = rootGetters['profile/currentProfile'];
            const isOffline = getters['isOfflineMode'];
            const { networkModel, repositoryFactory } = networkModelResult;
            const nodeService = new NodeService();
            const oldGenerationHash = getters['generationHash'];
            const networkType = networkModel.networkType;
            const nodes = await nodeService.getNodes(currentProfile, repositoryFactory, networkModel.url, isOffline);
            const getBlockchainHeightPromise = repositoryFactory.createChainRepository().getChainInfo().toPromise();
            const currentHeight = (await getBlockchainHeightPromise).height.compact();
            const networkListener = repositoryFactory.createListener();

            const currentPeer = URLHelpers.getNodeUrl(networkModel.url);
            commit('currentPeer', currentPeer);
            if (currentProfile) {
                const profileService: ProfileService = new ProfileService();
                profileService.updateSelectedNode(currentProfile, currentPeer);
            }
            const currentNetworkType = currentProfile ? currentProfile.networkType : networkType;
            commit('networkModel', networkModel);
            commit('networkConfiguration', networkModel.networkConfiguration);
            commit('transactionFees', networkModel.transactionFees);
            commit('networkType', networkType);
            commit('epochAdjustment', networkModel.networkConfiguration.epochAdjustment);
            commit('generationHash', networkModel.generationHash);
            commit('repositoryFactory', repositoryFactory);
            commit(
                'knowNodes',
                nodes.filter((node) => node.networkType === currentNetworkType),
            );
            const currentNetworkListener: IListener = getters['listener'];
            if (currentNetworkListener && currentNetworkListener.isOpen()) {
                currentNetworkListener.close();
            }
            commit('listener', networkListener);
            if (networkListener && !networkListener.isOpen()) {
                await networkListener.open();
                await dispatch('SUBSCRIBE');
            }

            commit('currentHeight', currentHeight);
            commit(
                'currentPeerInfo',
                nodes.find((n) => n.url === networkModel.url),
            );
            commit('setConnected', true);
            await dispatch('SET_CLIENT_SERVER_TIME_DIFFERENCE');
            commit('connectingToNodeInfo', {
                isTryingToConnect: false,
            });
            $eventBus.$emit('newConnection', currentPeer);
            // subscribe to updates
            if (oldGenerationHash != networkModel.generationHash) {
                await dispatch('account/NETWORK_CHANGED', {}, { root: true });
                await dispatch('statistics/LOAD', {}, { root: true });

                // check if current profile network type and generation hash matches current network
                if (
                    currentProfile &&
                    (currentProfile.networkType !== networkModel.networkType ||
                        currentProfile.generationHash !== networkModel.generationHash)
                ) {
                    dispatch('SET_NETWORK_IS_NOT_MATCHING_PROFILE', true);
                } else {
                    dispatch('SET_NETWORK_IS_NOT_MATCHING_PROFILE', false);
                }
            }
            const currentSignerAddress = rootGetters['account/currentSignerAddress'];
            if (currentSignerAddress) {
                // close websocket subscription for old node
                await dispatch('UNSUBSCRIBE');
                await dispatch('account/UNSUBSCRIBE', currentSignerAddress, { root: true });
                // subscribe to the newly selected node websocket
                if (networkListener && !networkListener.isOpen()) {
                    await networkListener.open();
                }
                await dispatch('SUBSCRIBE');
                await dispatch('account/SUBSCRIBE', currentSignerAddress, { root: true });
            }
        },
        SET_NETWORK_TYPE({ commit }, networkType: NetworkType) {
            commit('networkType', networkType);
        },
        async SET_CURRENT_PEER({ dispatch }, currentPeerUrl) {
            if (!UrlValidator.validate(currentPeerUrl)) {
                console.log('Cannot change node. URL is not valid: ' + currentPeerUrl);
                return await dispatch('notification/ADD_ERROR', NotificationType.INVALID_NODE, { root: true });
            }

            // - show loading overlay
            dispatch(
                'app/SET_LOADING_OVERLAY',
                {
                    show: true,
                    message: `${app.$t('info_connecting_peer', {
                        peerUrl: currentPeerUrl,
                    })}`,
                    disableCloseButton: true,
                },
                { root: true },
            );

            dispatch('diagnostic/ADD_DEBUG', 'Store action network/SET_CURRENT_PEER dispatched with: ' + currentPeerUrl, {
                root: true,
            });

            try {
                // - disconnect from previous node

                await dispatch('CONNECT', { newCandidateUrl: currentPeerUrl });
            } catch (e) {
                console.log(e);
                await dispatch(
                    'notification/ADD_ERROR',
                    `${app.$t('error_peer_connection_went_wrong', {
                        peerUrl: currentPeerUrl,
                    })}`,
                    { root: true },
                );
                dispatch('diagnostic/ADD_ERROR', 'Error with store action network/SET_CURRENT_PEER: ' + JSON.stringify(e), {
                    root: true,
                });
            } finally {
                // - hide loading overlay
                dispatch('app/SET_LOADING_OVERLAY', { show: false }, { root: true });
            }
        },

        async REST_NETWORK_RENTAL_FEES({ rootGetters, commit }) {
            const repositoryFactory: RepositoryFactory = rootGetters['network/repositoryFactory'];
            if (!repositoryFactory) {
                return;
            }
            const getRentalFeesPromise = repositoryFactory.createNetworkRepository().getRentalFees().toPromise();
            const rentalFees = await getRentalFeesPromise;
            commit('rentalFeeEstimation', rentalFees);
        },
        SET_NETWORK_IS_NOT_MATCHING_PROFILE({ commit }, networkIsNotMatchingProfile) {
            commit('networkIsNotMatchingProfile', networkIsNotMatchingProfile);
        },
        async ADD_KNOWN_PEER({ commit, rootGetters, dispatch }, peerUrl) {
            if (!UrlValidator.validate(peerUrl)) {
                throw Error('Cannot add node. URL is not valid: ' + peerUrl);
            }
            const profile: ProfileModel = rootGetters['profile/currentProfile'];
            commit('addPeer', { peerUrl, profile });
            const repositoryFactory = rootGetters['network/repositoryFactory'];
            const isConnected = rootGetters['network/isConnected'];
            if (!repositoryFactory || !isConnected) {
                await dispatch('SET_CURRENT_PEER', peerUrl);
            }
        },
        REMOVE_KNOWN_PEER({ commit, rootGetters }, peerUrl) {
            const profile: ProfileModel = rootGetters['profile/currentProfile'];
            commit('removePeer', { peerUrl, profile });
        },

        async UPDATE_PEER({ commit, rootGetters, getters }, peerUrl) {
            const repositoryFactory = new RepositoryFactoryHttp(peerUrl);
            const nodeService = new NodeService();
            const currentProfile: ProfileModel = rootGetters['profile/currentProfile'];
            const isOffline = getters['isOfflineMode'];
            const knownNodes = await nodeService.getNodes(currentProfile, repositoryFactory, peerUrl, isOffline);
            commit('knowNodes', knownNodes);
        },

        async RESET_PEERS({ dispatch, getters }) {
            const nodeService = new NodeService();
            nodeService.reset();

            const networkService = new NetworkService();
            networkService.reset(getters['generationHash']);

            dispatch('SET_CURRENT_PEER', networkService.getDefaultUrl());
        },

        async LOAD_PEER_NODES({ commit, getters }) {
            const nodeService = new NodeService();
            const networkType = getters['networkType'];
            const isOffline = getters['isOfflineMode'];
            commit('peerNodes', _.uniqBy(await nodeService.getNodesFromStatisticService(networkType, 100, false, isOffline), 'url'));
        },

        // set current difference between server and local time
        async SET_CLIENT_SERVER_TIME_DIFFERENCE({ getters, commit }) {
            const isOffline = getters['isOfflineMode'];
            // using server time for online transactions
            if (!isOffline) {
                const repositoryFactory: RepositoryFactory = getters['repositoryFactory'] as RepositoryFactory;
                const epochAdjustment = getters['epochAdjustment'];
                const serverDeadline = await (await DeadlineService.create(repositoryFactory)).createDeadlineUsingServerTime();
                const localDeadline = Deadline.create(epochAdjustment);
                const adjustedDifference = serverDeadline.adjustedValue - localDeadline.adjustedValue;
                commit('setClientServerTimeDifference', adjustedDifference);
            }
            // using local time in offline transactions
            else {
                commit('setClientServerTimeDifference', 0);
            }
        },

        /**
         * Websocket API
         */
        // Subscribe to latest account transactions.
        async SUBSCRIBE({ commit, dispatch, getters }) {
            // use RESTService to open websocket channel subscriptions
            const listener = getters['listener'] as Listener;
            listener.open().then(() => {
                const subscription = listener.newBlock().subscribe((block: BlockInfo) => {
                    dispatch('SET_CURRENT_HEIGHT', block.height.compact());
                    dispatch('diagnostic/ADD_INFO', 'New block height: ' + block.height.compact(), { root: true });
                });
                // update state of listeners & subscriptions
                commit('addSubscriptions', subscription);
            });
        },

        // Unsubscribe from all open websocket connections
        async UNSUBSCRIBE({ commit, getters }) {
            const subscriptions: Subscription[] = getters.subscriptions;
            subscriptions.forEach((s) => s.unsubscribe());
            const listener: Listener = getters.listener;
            if (listener && listener.isOpen()) {
                await listener.close();
            }
            // update state
            commit('subscriptions', []);
        },

        SET_CURRENT_HEIGHT({ commit }, height) {
            commit('currentHeight', height);
        },

        LOAD_TRANSACTION_FEES({ commit, rootGetters }) {
            commit('setFeesConfig', feesConfig);
            const repositoryFactory: RepositoryFactory = rootGetters['network/repositoryFactory'];
            const networkRepository = repositoryFactory.createNetworkRepository();
            networkRepository.getTransactionFees().subscribe((fees: TransactionFees) => {
                commit(
                    'transactionFees',
                    new TransactionFees(
                        fees.averageFeeMultiplier < fees.minFeeMultiplier ? fees.minFeeMultiplier : fees.averageFeeMultiplier,
                        fees.medianFeeMultiplier < fees.minFeeMultiplier ? fees.minFeeMultiplier : fees.medianFeeMultiplier,
                        fees.highestFeeMultiplier,
                        fees.lowestFeeMultiplier,
                        fees.minFeeMultiplier,
                    ),
                );
            });
        },
    },
};
