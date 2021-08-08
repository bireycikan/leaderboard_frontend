// import logo from './logo.svg';
import { useState, useEffect } from 'react';
import { AgGridColumn, AgGridReact } from 'ag-grid-react';
import axios from "axios";
import Swal from "sweetalert2";
import './App.scss';
import ReactPaginate from 'react-paginate';
import { io } from "socket.io-client";


const BACKEND_SERVER_URI = process.env.REACT_APP_BACKEND_SERVER_URI;

// connect backend socket
const socket = io(BACKEND_SERVER_URI)


const App = () => {
  const [gridApi, setGridApi] = useState(null);
  const [rowState, setRowState] = useState({ rowData: [], offset: 0, pageCount: 0, perPage: 100 });
  const [distribution, setDistribution] = useState({ disabled: false, stopped: true })
  const [simulation, setSimulation] = useState({ disabled: false, stopped: true })
  const [reset, setReset] = useState({ disabled: false, stopped: true });

  useEffect(() => {
    if (gridApi) {
      gridApi.sizeColumnsToFit();
    }

    const playerCountHandler = (playerCount) => {
      setRowState((prevState) => {
        socket.off('playerCount', playerCountHandler);
        return { ...prevState, pageCount: Math.ceil(playerCount / 100) }
      })
    }
    socket.on('playerCount', playerCountHandler)

    const errorHandler = (err) => {
      socket.off('connect_error', errorHandler);
      console.error('socket connect error: ', err)
    };
    socket.on('connect_error', errorHandler)

  }, [rowState, gridApi]);


  function handlePageClick(data) {
    let selected = data.selected;
    let offset = Math.ceil(selected * 100);

    axios(`${BACKEND_SERVER_URI}/api/players?top=100&offset=${offset}`)
      .then(response => {
        setPlayerData(response.data, offset)
      })
  };

  const onGridReady = (params) => {
    setGridApi(params.api);

    axios(`${BACKEND_SERVER_URI}/api/players`)
      .then(response => {
        setPlayerData(response.data, 0)
      })
  };

  function resetLeaderboardData() {
    setRowState({ ...rowState, rowData: [] });

    setReset({ ...reset, stopped: true, disabled: true })
    setDistribution({ ...distribution, disabled: true })
    setSimulation({ ...simulation, disabled: true })
  }

  function simulationStarted() {
    setReset({ ...reset, disabled: true })
    setDistribution({ ...distribution, disabled: true })
    setSimulation({ ...simulation, stopped: false, disabled: true })
  }

  function simulationStopped() {
    setReset({ ...reset, disabled: false })
    setDistribution({ ...distribution, disabled: false })
    setSimulation({ ...simulation, stopped: true, disabled: false })
  }

  function distributionStarted() {
    setReset({ ...reset, disabled: true })
    setDistribution({ ...distribution, stopped: false, disabled: true })
    setSimulation({ ...simulation, disabled: true })
  }

  function distributionStopped() {
    setReset({ ...reset, disabled: true })
    setDistribution({ ...distribution, stopped: true, disabled: true })
    setSimulation({ ...simulation, disabled: true })
  }


  function setPlayerData(playerData, offset) {
    const { players, playersInfo, fromRedis } = playerData;

    console.log('players: ', players)
    console.log('playersInfo: ', playersInfo)

    const data = [];
    let rank = offset ? offset + 1 : 1;
    let player = null;
    for (let i = 0; i < players.length; fromRedis ? i += 2 : i++) {
      if (fromRedis) {
        player = {
          rank: rank,
          username: players[i],
          money: players[i + 1],
          country: playersInfo[players[i]]['country'],
          dailydiff: playersInfo[players[i]]['dailydiff']
        }
      }
      else {
        player = {
          rank: rank,
          username: players[i].username,
          money: players[i].money,
          country: playersInfo[players[i].username]['country'],
          dailydiff: playersInfo[players[i].username]['dailydiff']
        }
      }
      data.push(player)
      rank++;
    }
    setRowState((prevState) => {
      return { ...prevState, rowData: data }
    });


    if (data.length) {
      setDistribution({ ...distribution, disabled: false })
      setReset({ ...reset, disabled: false })
      setSimulation({ ...simulation, disabled: false })
    }
  }

  const getTopPlayer = function (topLimit, e) {
    axios(`${BACKEND_SERVER_URI}/api/players?top=${topLimit}&offset=0`)
      .then(response => {
        setPlayerData(response.data, 0);
      })
  }

  const resetLeaderboard = function (e) {
    setReset({ ...reset, stopped: false, disabled: true })

    axios(`${BACKEND_SERVER_URI}/api/players/reset`)
      .then(response => {
        if (response.data.success) {
          resetLeaderboardData();
          Swal.fire('Leaderboard reseted!');
        }
        else Swal.fire('Something failed while reseting the leaderboard!')
      })
  }

  const simulateOneWeekChanges = async function (e) {
    simulationStarted();
    const simulateHandler = ({ day, players, playersInfo }) => {
      if (day === 7) {
        simulationStopped();
        socket.off('simulate', simulateHandler)
      }

      console.log('day: ', day)
      console.log('players: ', players)
      console.log('playersInfo: ', playersInfo)
    };
    socket.on('simulate', simulateHandler)

    await axios(`${BACKEND_SERVER_URI}/api/players/simulate`)

  }

  const calculatePrizePool = function (ratio, e) {
    distributionStarted();
    axios(`${BACKEND_SERVER_URI}/api/players/calculate-prize-pool?ratio=${ratio}`)
      .then(response => {
        console.log('response: ', response.data);
        distributionStopped();
        setPlayerData(response.data, 0);
        Swal.fire('Prize pool distributed among players');
      })
  }

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <div className="board">
        <div className="leadheader">
          <h2>Leaderboard</h2>
        </div>
        <div className="player-grids">
          <div className="ag-theme-alpine">
            <AgGridReact
              onGridReady={onGridReady}
              rowData={rowState.rowData}>
              <AgGridColumn field="rank"></AgGridColumn>
              <AgGridColumn field="username"></AgGridColumn>
              <AgGridColumn field="country"></AgGridColumn>
              <AgGridColumn field="money"></AgGridColumn>
              <AgGridColumn field="dailydiff"></AgGridColumn>
            </AgGridReact>
          </div>
          <div className="interaction-buttons">
            <button className="btn btn-warning" onClick={(e) => getTopPlayer(100, e)} >Get Top 100 Players</button>
            <button
              className="btn btn-danger"
              disabled={reset.disabled}
              onClick={resetLeaderboard}>
              {reset.stopped ? 'Reset Leaderboard' : 'Please wait...'}
            </button>
            <button
              className="btn btn-info"
              disabled={simulation.disabled}
              onClick={simulateOneWeekChanges}>
              {simulation.stopped ? 'Simulate Weekly Changes' : 'Simulation continues...'}
            </button>
            <button
              className="btn btn-primary"
              disabled={distribution.disabled}
              onClick={(e) => calculatePrizePool(2, e)}>
              {distribution.stopped ? 'Distribute Prize Pool Among Players' : 'Distribution continues...'}
            </button>
          </div>
          <div className="paginate">
            <ReactPaginate
              containerClassName="pagination"
              pageClassName="page-item"
              pageLinkClassName="page-link"
              activeClassName="active"
              activeLinkClassName="page-link"
              previousClassName="page-item"
              nextClassName="page-item"
              previousLinkClassName="page-link"
              nextLinkClassName="page-link"
              disabledClassName="disabled"
              pageCount={rowState.pageCount}
              pageRangeDisplayed={5}
              onPageChange={handlePageClick}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;