import React, {useState, useEffect, useRef} from 'react';
import {Menu, Typography } from 'antd';
import { ContainerOutlined, SmileOutlined, RightOutlined } from '@ant-design/icons';
import {Link, useLocation} from 'react-router-dom';
import { backendUrl, taskOptions, userPid } from '../utils/Const';
import WordCloud from 'react-d3-cloud';
const menue_items = [

  {
    key: "profiles",
    label: <Link to="/profile"> 我的对抗规则 </Link>,
    icon: <ContainerOutlined />,
  },

  {
    key: 'agents',
    label: '画像管理助手',
    icon: <SmileOutlined />,
    type: 'Agents',
    children: [
      { key: '1', label: <Link to="/fuzzy"> {taskOptions[0]}</Link>, icon: <RightOutlined />},
      // { key: '2', label: <Link to="/alignment">{taskOptions[1]}</Link>, icon: <RightOutlined />},
      { key: '3', label: <Link to="/feedback">{taskOptions[2]}</Link> , icon: <RightOutlined />},
    ],
  },
]



function Home(
) {

  const onClick = (e) => {
    console.log('click Home Menu ', e);
  };

  return (
    <>
      <Menu
        onClick={onClick}
        style={{
          width: '100%',
        }}
        defaultSelectedKeys={[]}
        defaultOpenKeys={[]}
        mode="inline"
        items={menue_items}
        multiple={true}
        />
    </>
    
  );
}

export default Home;
